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
import { ShippoService, type ShippoAddress, type ShippoLabel } from './shippo.service';
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
    private readonly shippo: ShippoService,
  ) {}

  /** Whether the Shippo aggregator is configured (auto-label purchase). */
  get autoLabelEnabled(): boolean {
    return this.shippo.isConfigured;
  }

  async create(
    tenantId: string,
    orderId: string,
    dto: CreateShipmentDto,
  ): Promise<Shipment> {
    const order = await this.prisma.forTenant(tenantId, (tx) =>
      tx.order.findFirst({
        where: { id: orderId, tenantId },
        select: { id: true, shippingAddress: true },
      }),
    );
    if (!order) throw new NotFoundException('Order not found');

    // Optionally buy a Shippo label; any failure (no key, missing address, API
    // error) degrades to a manual shipment so fulfillment is never blocked.
    let label: ShippoLabel | null = null;
    if (dto.buyLabel && this.shippo.isConfigured) {
      label = await this.tryBuyLabel(tenantId, order.shippingAddress, dto).catch((err: unknown) => {
        this.logger.warn(
          `auto-label failed for order ${orderId} — manual shipment: ${err instanceof Error ? err.message : 'unknown'}`,
        );
        return null;
      });
    }

    const hasLabel = label !== null || Boolean(dto.trackingNumber);
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.shipment.create({
        data: {
          tenantId,
          orderId,
          provider: 'SHIPPO',
          status: hasLabel ? ShipmentStatus.LABEL_PURCHASED : ShipmentStatus.PENDING,
          carrier: label?.carrier ?? dto.carrier ?? null,
          service: label?.service ?? dto.service ?? null,
          trackingNumber: label?.trackingNumber ?? dto.trackingNumber ?? null,
          trackingUrl: label?.trackingUrl ?? dto.trackingUrl ?? null,
          labelUrlCached: label?.labelUrl ?? null,
          rateAmountCents: label?.rateAmountCents ?? dto.rateAmountCents ?? null,
          currency: label?.currency ?? 'USD',
          weightGrams: dto.weightGrams ?? null,
        },
      }),
    );
  }

  /** Resolve ship-from (default location) + ship-to (order snapshot) → buy label. */
  private async tryBuyLabel(
    tenantId: string,
    shippingAddress: Prisma.JsonValue,
    dto: CreateShipmentDto,
  ): Promise<ShippoLabel | null> {
    const to = this.toAddress(shippingAddress);
    if (!to) return null; // no ship-to on the order

    const location = await this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryLocation.findFirst({
        where: { tenantId, isDefault: true, addressId: { not: null } },
        include: { address: true },
      }),
    );
    if (!location?.address) return null; // no ship-from configured
    const a = location.address;
    const from: ShippoAddress = {
      name: a.company ?? ([a.firstName, a.lastName].filter(Boolean).join(' ') || 'Warehouse'),
      street1: a.line1,
      street2: a.line2,
      city: a.city,
      state: a.region,
      zip: a.postalCode,
      country: a.country,
      phone: a.phone,
    };
    return this.shippo.buyLabel(from, to, {
      lengthCm: dto.lengthCm ?? 20,
      widthCm: dto.widthCm ?? 15,
      heightCm: dto.heightCm ?? 10,
      weightG: dto.weightGrams ?? 500,
    });
  }

  /** Coerce an Order.shippingAddress JSON snapshot into a Shippo address. */
  private toAddress(json: Prisma.JsonValue): ShippoAddress | null {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    const a = json as Record<string, unknown>;
    const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
    const street1 = str(a.line1) ?? str(a.street1);
    const city = str(a.city);
    const country = str(a.country);
    if (!street1 || !city || !country) return null;
    return {
      name: [str(a.firstName), str(a.lastName)].filter(Boolean).join(' ') || str(a.name) || 'Customer',
      street1,
      street2: str(a.line2) ?? str(a.street2) ?? null,
      city,
      state: str(a.region) ?? str(a.state) ?? null,
      zip: str(a.postalCode) ?? str(a.zip) ?? null,
      country,
      phone: str(a.phone) ?? null,
    };
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
