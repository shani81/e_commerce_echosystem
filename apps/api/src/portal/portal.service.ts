import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReturnStatus, StoreStatus } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type { OrderLookupDto } from './dto/order-lookup.dto';
import type { RequestReturnDto } from './dto/request-return.dto';

/**
 * Public customer portal — guest order lookup + return requests, authenticated
 * only by (email + order number). This is deliberately lightweight for P1; a
 * verified magic-link/customer login is a carry-forward. Store-slug resolves to
 * a tenant via asSystem, then all reads/writes are tenant-scoped.
 */
@Injectable()
export class PortalService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveTenant(slug: string): Promise<string> {
    const store = await this.prisma.asSystem((tx) =>
      tx.store.findFirst({
        where: { slug, status: StoreStatus.PUBLISHED },
        select: { tenantId: true },
      }),
    );
    if (!store) throw new NotFoundException('Store not found');
    return store.tenantId;
  }

  async lookupOrder(slug: string, dto: OrderLookupDto) {
    const tenantId = await this.resolveTenant(slug);
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.findFirst({
        where: {
          tenantId,
          number: dto.orderNumber,
          email: { equals: dto.email, mode: 'insensitive' },
        },
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          shipments: { orderBy: { createdAt: 'desc' } },
          returns: { orderBy: { createdAt: 'desc' } },
        },
      }),
    );
    if (!order) throw new NotFoundException('Order not found — check the email and order number');
    return this.toOrderView(order);
  }

  async requestReturn(slug: string, dto: RequestReturnDto) {
    const tenantId = await this.resolveTenant(slug);
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.findFirst({
        where: {
          tenantId,
          number: dto.orderNumber,
          email: { equals: dto.email, mode: 'insensitive' },
        },
        include: { items: true },
      }),
    );
    if (!order) throw new NotFoundException('Order not found');

    const byId = new Map(order.items.map((it) => [it.id, it]));
    for (const line of dto.items) {
      const item = byId.get(line.orderItemId);
      if (!item) throw new BadRequestException(`Unknown order item ${line.orderItemId}`);
      if (line.quantity > item.quantity) {
        throw new BadRequestException(
          `Return quantity ${line.quantity} exceeds ordered ${item.quantity}`,
        );
      }
    }

    const created = await this.prisma.forTenant(tenantId, (tx) =>
      tx.return.create({
        data: {
          tenantId,
          orderId: order.id,
          status: ReturnStatus.REQUESTED,
          reason: dto.reason ?? null,
          items: {
            create: dto.items.map((l) => ({
              tenantId,
              orderItemId: l.orderItemId,
              quantity: l.quantity,
            })),
          },
        },
        select: { id: true, status: true, createdAt: true },
      }),
    );
    return created;
  }

  async getReturn(slug: string, id: string, email: string) {
    const tenantId = await this.resolveTenant(slug);
    const ret = await this.prisma.forTenant(tenantId, (tx) =>
      tx.return.findFirst({
        where: { id, tenantId, order: { email: { equals: email, mode: 'insensitive' } } },
        include: { items: true, order: { select: { number: true } } },
      }),
    );
    if (!ret) throw new NotFoundException('Return not found');
    return {
      id: ret.id,
      status: ret.status,
      orderNumber: ret.order.number,
      reason: ret.reason,
      items: ret.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity })),
      createdAt: ret.createdAt,
      refundedAt: ret.refundedAt,
    };
  }

  private toOrderView(order: {
    id: string;
    number: string;
    status: string;
    financialStatus: string;
    fulfillmentStatus: string;
    currency: string;
    subtotalCents: number;
    taxCents: number;
    shippingCents: number;
    totalCents: number;
    email: string | null;
    placedAt: Date | null;
    createdAt: Date;
    items: {
      id: string;
      productTitle: string;
      variantTitle: string | null;
      sku: string | null;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
    }[];
    shipments: {
      id: string;
      status: string;
      carrier: string | null;
      trackingNumber: string | null;
      trackingUrl: string | null;
      shippedAt: Date | null;
    }[];
    returns: { id: string; status: string; createdAt: Date }[];
  }) {
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      financialStatus: order.financialStatus,
      fulfillmentStatus: order.fulfillmentStatus,
      currency: order.currency,
      subtotalCents: order.subtotalCents,
      taxCents: order.taxCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      placedAt: order.placedAt,
      createdAt: order.createdAt,
      items: order.items.map((it) => ({
        orderItemId: it.id,
        productTitle: it.productTitle,
        variantTitle: it.variantTitle,
        sku: it.sku,
        quantity: it.quantity,
        unitPriceCents: it.unitPriceCents,
        totalCents: it.totalCents,
      })),
      shipments: order.shipments.map((s) => ({
        status: s.status,
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
        trackingUrl: s.trackingUrl,
        shippedAt: s.shippedAt,
      })),
      returns: order.returns.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt })),
    };
  }
}
