import { BadRequestException } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeService } from '../billing/stripe.service';
import type { NotificationsService } from '../notifications/notifications.service';

interface Tx {
  return: { findFirst: jest.Mock; update: jest.Mock };
  inventoryItem: { findFirst: jest.Mock; update: jest.Mock };
  stockMovement: { create: jest.Mock };
  refund: { create: jest.Mock };
  order: { update: jest.Mock };
}

function makeTx(): Tx {
  return {
    return: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    inventoryItem: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    stockMovement: { create: jest.fn().mockResolvedValue({}) },
    refund: { create: jest.fn().mockResolvedValue({}) },
    order: { update: jest.fn().mockResolvedValue({}) },
  };
}

function setup(tx: Tx, opts: { stripeConfigured?: boolean } = {}) {
  const forTenant = jest.fn((_t: string, fn: (tx: Tx) => unknown) => fn(tx));
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const refundsCreate = jest.fn().mockResolvedValue({ id: 're_test' });
  const svc = new ReturnsService(
    { forTenant } as unknown as PrismaService,
    {
      isApiConfigured: opts.stripeConfigured ?? false,
      client: { refunds: { create: refundsCreate } },
    } as unknown as StripeService,
    { enqueue } as unknown as NotificationsService,
  );
  return { svc, enqueue, refundsCreate };
}

describe('ReturnsService.approve', () => {
  it('moves REQUESTED → APPROVED and emails the buyer', async () => {
    const tx = makeTx();
    const base = { id: 'r1', tenantId: 't1', receivedAt: null, items: [], order: { id: 'o1', number: '1001', email: 'a@b.com', currency: 'USD', applicationFeeCents: 0, payments: [] } };
    tx.return.findFirst
      .mockResolvedValueOnce({ ...base, status: 'REQUESTED' })
      .mockResolvedValueOnce({ ...base, status: 'APPROVED' });
    const { svc, enqueue } = setup(tx);

    const res = await svc.approve('t1', 'r1');

    expect(tx.return.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' }, data: { status: 'APPROVED' } }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ template: 'return_approved', toAddress: 'a@b.com' }));
    expect(res.status).toBe('APPROVED');
  });

  it('rejects approving a return that is not REQUESTED', async () => {
    const tx = makeTx();
    tx.return.findFirst.mockResolvedValue({ id: 'r1', status: 'APPROVED', items: [], order: { payments: [] } });
    const { svc } = setup(tx);
    await expect(svc.approve('t1', 'r1')).rejects.toThrow(BadRequestException);
  });
});

describe('ReturnsService.refund', () => {
  const approved = {
    id: 'r1', tenantId: 't1', status: 'APPROVED', receivedAt: null,
    items: [{ id: 'ri1', quantity: 1, orderItem: { id: 'oi1', variantId: 'v1', unitPriceCents: 500 } }],
    order: { id: 'o1', number: '1001', email: 'a@b.com', currency: 'USD', applicationFeeCents: 0, payments: [{ id: 'p1', status: 'SUCCEEDED', stripePaymentIntentId: 'pi_x', amountCents: 1000 }] },
  };

  it('restocks, records a partial refund, and marks REFUNDED (manual path, no Stripe key)', async () => {
    const tx = makeTx();
    tx.return.findFirst.mockResolvedValueOnce(approved).mockResolvedValueOnce({ ...approved, status: 'REFUNDED' });
    tx.inventoryItem.findFirst.mockResolvedValue({ id: 'inv1', locationId: 'loc1', onHand: 8 });
    const { svc, enqueue, refundsCreate } = setup(tx, { stripeConfigured: false });

    const res = await svc.refund('t1', 'r1');

    expect(refundsCreate).not.toHaveBeenCalled(); // no live Stripe call
    expect(tx.inventoryItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inv1' }, data: { onHand: { increment: 1 } } }));
    expect(tx.stockMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'RETURN', quantity: 1, refType: 'return' }) }));
    expect(tx.refund.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amountCents: 500, paymentId: 'p1', stripeRefundId: null }) }));
    expect(tx.order.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ financialStatus: 'PARTIALLY_REFUNDED' }) }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ template: 'return_refunded', payload: expect.objectContaining({ amountCents: 500 }) }));
    expect(res.status).toBe('REFUNDED');
  });

  it('is idempotent — a REFUNDED return does no work', async () => {
    const tx = makeTx();
    tx.return.findFirst.mockResolvedValue({ id: 'r1', status: 'REFUNDED', items: [], order: { payments: [] } });
    const { svc } = setup(tx);

    const res = await svc.refund('t1', 'r1');

    expect(tx.refund.create).not.toHaveBeenCalled();
    expect(tx.return.update).not.toHaveBeenCalled();
    expect(res.status).toBe('REFUNDED');
  });
});
