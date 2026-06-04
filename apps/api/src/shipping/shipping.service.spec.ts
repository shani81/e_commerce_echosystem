import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ShipmentStatus } from '@aicos/db';
import { ShippingService } from './shipping.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ShippoService } from './shippo.service';

interface Tx {
  shipment: { findFirst: jest.Mock; update: jest.Mock };
  order: { update: jest.Mock };
}

function setup(existing: unknown) {
  const tx: Tx = {
    shipment: { findFirst: jest.fn().mockResolvedValue(existing), update: jest.fn() },
    order: { update: jest.fn().mockResolvedValue({ number: '1001', email: 'a@b.com', currency: 'USD' }) },
  };
  const forTenant = jest.fn((_t: string, fn: (tx: Tx) => unknown) => fn(tx));
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const get = jest.fn();
  const svc = new ShippingService(
    { forTenant } as unknown as PrismaService,
    { enqueue } as unknown as NotificationsService,
    { get } as unknown as ConfigService,
    { isConfigured: false } as unknown as ShippoService,
  );
  return { svc, tx, enqueue, get };
}

describe('ShippingService.update', () => {
  it('marking shipped sets shippedAt, FULFILLs the order, and emails the buyer', async () => {
    const existing = { id: 's1', tenantId: 't1', orderId: 'o1', status: ShipmentStatus.PENDING, carrier: 'USPS', trackingNumber: '1Z', trackingUrl: null };
    const { svc, tx, enqueue } = setup(existing);
    tx.shipment.update.mockResolvedValue({ ...existing, status: ShipmentStatus.IN_TRANSIT });

    const result = await svc.update('t1', 's1', { status: ShipmentStatus.IN_TRANSIT });

    expect(result.status).toBe(ShipmentStatus.IN_TRANSIT);
    expect(tx.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: ShipmentStatus.IN_TRANSIT, shippedAt: expect.any(Date) }) }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'o1' }, data: { fulfillmentStatus: 'FULFILLED' } }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'shipment_tracking', toAddress: 'a@b.com', payload: expect.objectContaining({ orderNumber: '1001' }) }),
    );
  });

  it('marking delivered sets deliveredAt and does not re-notify', async () => {
    const existing = { id: 's1', tenantId: 't1', orderId: 'o1', status: ShipmentStatus.IN_TRANSIT };
    const { svc, tx, enqueue } = setup(existing);
    tx.shipment.update.mockResolvedValue({ ...existing, status: ShipmentStatus.DELIVERED });

    await svc.update('t1', 's1', { status: ShipmentStatus.DELIVERED });

    expect(tx.shipment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deliveredAt: expect.any(Date) }) }),
    );
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('a non-status edit (carrier only) does not fulfill or notify', async () => {
    const existing = { id: 's1', tenantId: 't1', orderId: 'o1', status: ShipmentStatus.PENDING };
    const { svc, tx, enqueue } = setup(existing);
    tx.shipment.update.mockResolvedValue({ ...existing, carrier: 'DHL' });

    await svc.update('t1', 's1', { carrier: 'DHL' });

    expect(tx.order.update).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('throws NotFound when the shipment is missing', async () => {
    const { svc } = setup(null);
    await expect(svc.update('t1', 'missing', { status: ShipmentStatus.IN_TRANSIT })).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('ShippingService.autoLabelEnabled', () => {
  it('reflects ShippoService.isConfigured', () => {
    const mk = (configured: boolean) =>
      new ShippingService(
        {} as unknown as PrismaService,
        {} as unknown as NotificationsService,
        {} as unknown as ConfigService,
        { isConfigured: configured } as unknown as ShippoService,
      );
    expect(mk(true).autoLabelEnabled).toBe(true);
    expect(mk(false).autoLabelEnabled).toBe(false);
  });
});
