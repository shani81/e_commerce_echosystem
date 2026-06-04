import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeService } from '../billing/stripe.service';

interface Tx {
  order: { findFirst: jest.Mock; update: jest.Mock };
  refund: { create: jest.Mock };
  payment: { update: jest.Mock };
}

function makeTx(order: unknown): Tx {
  return {
    order: { findFirst: jest.fn().mockResolvedValue(order), update: jest.fn().mockResolvedValue({}) },
    refund: { create: jest.fn().mockResolvedValue({}) },
    payment: { update: jest.fn().mockResolvedValue({}) },
  };
}

function setup(order: unknown, opts: { assertThrows?: boolean } = {}) {
  const tx = makeTx(order);
  const forTenant = jest.fn((_t: string, fn: (tx: Tx) => unknown) => fn(tx));
  const assertApiConfigured = jest.fn(() => {
    if (opts.assertThrows) throw new Error('Stripe is not configured');
  });
  const refundsCreate = jest.fn().mockResolvedValue({ id: 're_1' });
  const svc = new OrdersService(
    { forTenant } as unknown as PrismaService,
    { assertApiConfigured, client: { refunds: { create: refundsCreate } } } as unknown as StripeService,
  );
  return { svc, tx, refundsCreate, assertApiConfigured };
}

const paidOrder = {
  id: 'o1', tenantId: 't1', currency: 'USD', applicationFeeCents: 0,
  items: [], refunds: [],
  payments: [{ id: 'p1', status: 'SUCCEEDED', stripePaymentIntentId: 'pi_x', amountCents: 1000 }],
};

describe('OrdersService.refund', () => {
  it('full refund → REFUNDED order + payment, Stripe refund for the full amount', async () => {
    const { svc, tx, refundsCreate } = setup(paidOrder);
    await svc.refund('t1', 'o1', {});

    expect(refundsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ payment_intent: 'pi_x', amount: 1000, reverse_transfer: false }),
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ financialStatus: 'REFUNDED', status: 'REFUNDED' }) }),
    );
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REFUNDED' } }),
    );
  });

  it('partial refund → PARTIALLY_REFUNDED, payment untouched', async () => {
    const { svc, tx, refundsCreate } = setup(paidOrder);
    await svc.refund('t1', 'o1', { amountCents: 400 });

    expect(refundsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 400 }));
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { financialStatus: 'PARTIALLY_REFUNDED' } }),
    );
    expect(tx.payment.update).not.toHaveBeenCalled();
  });

  it('rejects when there is no captured payment', async () => {
    const { svc } = setup({ ...paidOrder, payments: [] });
    await expect(svc.refund('t1', 'o1', {})).rejects.toThrow(BadRequestException);
  });

  it('rejects a refund exceeding the captured amount', async () => {
    const { svc } = setup(paidOrder);
    await expect(svc.refund('t1', 'o1', { amountCents: 2000 })).rejects.toThrow(BadRequestException);
  });

  it('propagates the 503 when Stripe is unconfigured (assertApiConfigured throws)', async () => {
    const { svc, refundsCreate } = setup(paidOrder, { assertThrows: true });
    await expect(svc.refund('t1', 'o1', {})).rejects.toThrow('Stripe is not configured');
    expect(refundsCreate).not.toHaveBeenCalled();
  });
});
