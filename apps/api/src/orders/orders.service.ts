import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialStatus,
  OrderStatus,
  PaymentStatus,
  type Prisma,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import type { PaginatedResult } from '../common/dto/pagination.dto';
import type { ListOrdersDto } from './dto/list-orders.dto';
import type { RefundOrderDto } from './dto/refund-order.dto';

/** Summary row for the orders list. */
export interface OrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  financialStatus: FinancialStatus;
  totalCents: number;
  currency: string;
  email: string | null;
  itemCount: number;
  createdAt: Date;
}

/**
 * Admin-side order management (tenant-scoped). Lists/reads orders and issues
 * refunds through Stripe. The buy-side lifecycle (DRAFT→PAID) is driven by the
 * checkout flow + Stripe webhooks, not here.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  async list(tenantId: string, query: ListOrdersDto): Promise<PaginatedResult<OrderSummary>> {
    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const { rows, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
          select: {
            id: true,
            number: true,
            status: true,
            financialStatus: true,
            totalCents: true,
            currency: true,
            email: true,
            createdAt: true,
            _count: { select: { items: true } },
          },
        }),
        tx.order.count({ where }),
      ]);
      return { rows, total };
    });

    return {
      items: rows.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        financialStatus: o.financialStatus,
        totalCents: o.totalCents,
        currency: o.currency,
        email: o.email,
        itemCount: o._count.items,
        createdAt: o.createdAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.findFirst({
        where: { id, tenantId },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
          refunds: { orderBy: { createdAt: 'desc' } },
        },
      }),
    );
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /**
   * Refund (all or part of) an order's captured Stripe payment. Creates the
   * Stripe refund, writes the Refund row (idempotent on stripeRefundId), and
   * advances the order's financial status. For destination charges, the transfer
   * is reversed proportionally (reverse_transfer).
   */
  async refund(tenantId: string, id: string, dto: RefundOrderDto) {
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.findFirst({
        where: { id, tenantId },
        include: { payments: { orderBy: { createdAt: 'desc' } } },
      }),
    );
    if (!order) throw new NotFoundException('Order not found');

    const payment = order.payments.find(
      (p) => p.status === PaymentStatus.SUCCEEDED && p.stripePaymentIntentId,
    );
    if (!payment || !payment.stripePaymentIntentId) {
      throw new BadRequestException('Order has no captured payment to refund');
    }

    const amount = dto.amountCents ?? payment.amountCents;
    if (amount > payment.amountCents) {
      throw new BadRequestException(
        `Refund ${amount} exceeds captured amount ${payment.amountCents}`,
      );
    }

    this.stripe.assertApiConfigured();
    const reverseTransfer = order.applicationFeeCents > 0;
    const stripeRefund = await this.stripe.client.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount,
      reason: 'requested_by_customer',
      reverse_transfer: reverseTransfer,
    });

    const fullyRefunded = amount >= payment.amountCents;
    await this.prisma.forTenant(tenantId, async (tx) => {
      await tx.refund.create({
        data: {
          tenantId,
          orderId: order.id,
          paymentId: payment.id,
          amountCents: amount,
          currency: order.currency,
          reason: dto.reason ?? null,
          reverseTransfer,
          stripeRefundId: stripeRefund.id,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          financialStatus: fullyRefunded
            ? FinancialStatus.REFUNDED
            : FinancialStatus.PARTIALLY_REFUNDED,
          ...(fullyRefunded ? { status: OrderStatus.REFUNDED } : {}),
        },
      });
      if (fullyRefunded) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });
      }
    });

    this.logger.log(
      `refund: order ${order.number} ${amount}${order.currency} (${stripeRefund.id})`,
    );
    return this.findOne(tenantId, id);
  }
}
