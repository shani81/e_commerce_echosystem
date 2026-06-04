import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialStatus,
  ReturnStatus,
  StockMovementType,
  type Prisma,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { PaginatedResult } from '../common/dto/pagination.dto';
import type { ListReturnsDto } from './dto/list-returns.dto';

export interface ReturnSummary {
  id: string;
  status: ReturnStatus;
  orderId: string;
  orderNumber: string;
  reason: string | null;
  itemCount: number;
  createdAt: Date;
}

/**
 * Admin-side returns (RMA) management. A customer requests a return via the
 * storefront portal; staff approve/reject, and on refund the items are restocked
 * (RETURN ledger movement) and the money returned through Stripe (when a captured
 * payment exists). Buyers are emailed on approval + refund.
 */
@Injectable()
export class ReturnsService {
  private readonly logger = new Logger(ReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(tenantId: string, query: ListReturnsDto): Promise<PaginatedResult<ReturnSummary>> {
    const where: Prisma.ReturnWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };
    const { rows, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.return.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
          include: { order: { select: { number: true } }, _count: { select: { items: true } } },
        }),
        tx.return.count({ where }),
      ]);
      return { rows, total };
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        status: r.status,
        orderId: r.orderId,
        orderNumber: r.order.number,
        reason: r.reason,
        itemCount: r._count.items,
        createdAt: r.createdAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  findOne(tenantId: string, id: string) {
    return this.requireReturn(tenantId, id);
  }

  /** REQUESTED → APPROVED; email the buyer to send the item(s) back. */
  async approve(tenantId: string, id: string) {
    const ret = await this.requireReturn(tenantId, id);
    if (ret.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException(`Cannot approve a return in status ${ret.status}`);
    }
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.return.update({ where: { id }, data: { status: ReturnStatus.APPROVED } }),
    );
    await this.notifications.enqueue({
      tenantId,
      template: 'return_approved',
      toAddress: ret.order.email,
      payload: { orderNumber: ret.order.number },
      refType: 'return',
      refId: id,
    });
    return this.requireReturn(tenantId, id);
  }

  async reject(tenantId: string, id: string) {
    const ret = await this.requireReturn(tenantId, id);
    if (ret.status === ReturnStatus.REFUNDED) {
      throw new BadRequestException('Cannot reject an already-refunded return');
    }
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.return.update({ where: { id }, data: { status: ReturnStatus.REJECTED } }),
    );
    return this.requireReturn(tenantId, id);
  }

  /**
   * Refund a return: restock the items, refund the money (Stripe when a captured
   * payment exists), advance financial status, and mark the return REFUNDED.
   */
  async refund(tenantId: string, id: string) {
    const ret = await this.requireReturn(tenantId, id);
    if (ret.status === ReturnStatus.REFUNDED) return ret;
    if (ret.status === ReturnStatus.REJECTED) {
      throw new BadRequestException('Cannot refund a rejected return');
    }

    const amount = ret.items.reduce((s, ri) => s + ri.orderItem.unitPriceCents * ri.quantity, 0);
    const order = ret.order;
    const payment = order.payments.find(
      (p) => p.status === 'SUCCEEDED' && p.stripePaymentIntentId,
    );

    let stripeRefundId: string | null = null;
    if (payment?.stripePaymentIntentId && this.stripe.isApiConfigured && amount > 0) {
      const r = await this.stripe.client.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount,
        reason: 'requested_by_customer',
        reverse_transfer: order.applicationFeeCents > 0,
      });
      stripeRefundId = r.id;
    } else if (!payment) {
      this.logger.warn(`return ${id}: no captured payment — recording manual refund`);
    }

    await this.prisma.forTenant(tenantId, async (tx) => {
      for (const ri of ret.items) {
        if (ri.orderItem.variantId) {
          await this.restock(tx, tenantId, ri.orderItem.variantId, ri.quantity, id);
        }
      }
      if (payment) {
        await tx.refund.create({
          data: {
            tenantId,
            orderId: order.id,
            paymentId: payment.id,
            amountCents: amount,
            currency: order.currency,
            reason: 'return',
            reverseTransfer: order.applicationFeeCents > 0,
            stripeRefundId,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: {
            financialStatus:
              amount >= payment.amountCents
                ? FinancialStatus.REFUNDED
                : FinancialStatus.PARTIALLY_REFUNDED,
          },
        });
      }
      await tx.return.update({
        where: { id },
        data: {
          status: ReturnStatus.REFUNDED,
          receivedAt: ret.receivedAt ?? new Date(),
          refundedAt: new Date(),
        },
      });
    });

    await this.notifications.enqueue({
      tenantId,
      template: 'return_refunded',
      toAddress: order.email,
      payload: { orderNumber: order.number, amountCents: amount, currency: order.currency },
      refType: 'return',
      refId: id,
    });
    this.logger.log(`return ${id} refunded ${amount} ${order.currency}`);
    return this.requireReturn(tenantId, id);
  }

  /** Restock a variant on return: increment on-hand + RETURN ledger movement. */
  private async restock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    variantId: string,
    quantity: number,
    returnId: string,
  ): Promise<void> {
    const stock = await tx.inventoryItem.findFirst({
      where: { variantId },
      orderBy: { updatedAt: 'desc' },
    });
    if (!stock) {
      this.logger.warn(`return ${returnId}: no inventory item for variant ${variantId} — not restocked`);
      return;
    }
    await tx.inventoryItem.update({
      where: { id: stock.id },
      data: { onHand: { increment: quantity } },
    });
    await tx.stockMovement.create({
      data: {
        tenantId,
        inventoryItemId: stock.id,
        locationId: stock.locationId,
        type: StockMovementType.RETURN,
        quantity,
        reason: 'Return restock',
        refType: 'return',
        refId: returnId,
      },
    });
  }

  private async requireReturn(tenantId: string, id: string) {
    const ret = await this.prisma.forTenant(tenantId, (tx) =>
      tx.return.findFirst({
        where: { id, tenantId },
        include: {
          items: { include: { orderItem: true } },
          order: { include: { payments: true } },
        },
      }),
    );
    if (!ret) throw new NotFoundException('Return not found');
    return ret;
  }
}
