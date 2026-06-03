import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FulfillmentStatus,
  ShipmentStatus,
  type Prisma,
  type Shipment,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { CreateShipmentDto } from './dto/create-shipment.dto';
import type { UpdateShipmentDto } from './dto/update-shipment.dto';

/**
 * Order fulfillment / shipments. In Phase 1 the merchant records the carrier +
 * tracking manually (a complete, usable flow); automated label purchase via the
 * Shippo aggregator is gated on SHIPPO_API_KEY and is a carry-forward. Moving a
 * shipment to IN_TRANSIT marks the order FULFILLED and emails the buyer a
 * tracking notification.
 */
@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /** Whether the Shippo aggregator is configured (auto-label purchase). */
  get autoLabelEnabled(): boolean {
    return Boolean(this.config.get<string>('shipping.shippoApiKey'));
  }

  async create(
    tenantId: string,
    orderId: string,
    dto: CreateShipmentDto,
  ): Promise<Shipment> {
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.findFirst({ where: { id: orderId, tenantId }, select: { id: true } }),
    );
    if (!order) throw new NotFoundException('Order not found');

    return this.prisma.forTenant(tenantId, (tx) =>
      tx.shipment.create({
        data: {
          tenantId,
          orderId,
          provider: 'SHIPPO',
          status: dto.trackingNumber ? ShipmentStatus.LABEL_PURCHASED : ShipmentStatus.PENDING,
          carrier: dto.carrier ?? null,
          service: dto.service ?? null,
          trackingNumber: dto.trackingNumber ?? null,
          trackingUrl: dto.trackingUrl ?? null,
          rateAmountCents: dto.rateAmountCents ?? null,
          weightGrams: dto.weightGrams ?? null,
        },
      }),
    );
  }

  list(tenantId: string, orderId: string): Promise<Shipment[]> {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.shipment.findMany({ where: { tenantId, orderId }, orderBy: { createdAt: 'desc' } }),
    );
  }

  async update(
    tenantId: string,
    shipmentId: string,
    dto: UpdateShipmentDto,
  ): Promise<Shipment> {
    const existing = await this.prisma.forTenant(tenantId, (tx) =>
      tx.shipment.findFirst({ where: { id: shipmentId, tenantId } }),
    );
    if (!existing) throw new NotFoundException('Shipment not found');

    const becomingShipped =
      dto.status === ShipmentStatus.IN_TRANSIT && existing.status !== ShipmentStatus.IN_TRANSIT;
    const becomingDelivered =
      dto.status === ShipmentStatus.DELIVERED && existing.status !== ShipmentStatus.DELIVERED;

    const data: Prisma.ShipmentUpdateInput = {
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.carrier !== undefined ? { carrier: dto.carrier } : {}),
      ...(dto.trackingNumber !== undefined ? { trackingNumber: dto.trackingNumber } : {}),
      ...(dto.trackingUrl !== undefined ? { trackingUrl: dto.trackingUrl } : {}),
      ...(becomingShipped ? { shippedAt: new Date() } : {}),
      ...(becomingDelivered ? { deliveredAt: new Date() } : {}),
    };

    const shipment = await this.prisma.forTenant(tenantId, (tx) =>
      tx.shipment.update({ where: { id: shipmentId }, data }),
    );

    if (becomingShipped) await this.onShipped(tenantId, shipment);
    return shipment;
  }

  /** Convenience: mark a shipment shipped (→ IN_TRANSIT) in one call. */
  ship(tenantId: string, shipmentId: string): Promise<Shipment> {
    return this.update(tenantId, shipmentId, { status: ShipmentStatus.IN_TRANSIT });
  }

  /** Order becomes FULFILLED; buyer gets a tracking email. */
  private async onShipped(tenantId: string, shipment: Shipment): Promise<void> {
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.update({
        where: { id: shipment.orderId },
        data: { fulfillmentStatus: FulfillmentStatus.FULFILLED },
        select: { number: true, email: true, currency: true },
      }),
    );

    await this.notifications.enqueue({
      tenantId,
      template: 'shipment_tracking',
      toAddress: order.email,
      subject: `Your order #${order.number} has shipped`,
      payload: {
        orderNumber: order.number,
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        trackingUrl: shipment.trackingUrl,
      },
      refType: 'shipment',
      refId: shipment.id,
    });
    this.logger.log(`order ${order.number} shipped (shipment ${shipment.id})`);
  }
}
