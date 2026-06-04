import { NotFoundException } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { Queue } from 'bullmq';

interface Tx {
  customer: { findFirst: jest.Mock; update: jest.Mock };
  order: { updateMany: jest.Mock; findMany: jest.Mock };
  address: { updateMany: jest.Mock };
  auditLog: { create: jest.Mock };
}

function setup(tx: Tx) {
  const forTenant = jest.fn((_t: string, fn: (tx: Tx) => unknown) => fn(tx));
  const add = jest.fn().mockResolvedValue(undefined);
  const svc = new GdprService(
    { forTenant } as unknown as PrismaService,
    { add } as unknown as Queue,
  );
  return { svc };
}

function baseTx(): Tx {
  return {
    customer: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
    address: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
}

describe('GdprService.eraseCustomer', () => {
  it('pseudonymizes the customer + orders + addresses and audits ERASE', async () => {
    const tx = baseTx();
    tx.customer.findFirst.mockResolvedValue({ id: 'c1', email: 'real@x.com' });
    tx.order.updateMany.mockResolvedValue({ count: 2 });
    const { svc } = setup(tx);

    const result = await svc.eraseCustomer('t1', 'c1');

    const anon = 'erased-c1@anonymized.invalid';
    expect(tx.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { email: anon } }),
    );
    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: anon, firstName: null, deletedAt: expect.any(Date) }) }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'ERASE', entityType: 'customer' }) }),
    );
    expect(result).toEqual({ erased: true, customerId: 'c1', ordersScrubbed: 2 });
  });

  it('throws NotFound for an unknown customer', async () => {
    const tx = baseTx();
    tx.customer.findFirst.mockResolvedValue(null);
    const { svc } = setup(tx);
    await expect(svc.eraseCustomer('t1', 'missing')).rejects.toThrow(NotFoundException);
  });
});

describe('GdprService.exportCustomer', () => {
  it('bundles the customer + orders and audits EXPORT', async () => {
    const tx = baseTx();
    tx.customer.findFirst.mockResolvedValue({ id: 'c1', email: 'real@x.com', addresses: [] });
    tx.order.findMany.mockResolvedValue([{ id: 'o1' }, { id: 'o2' }]);
    const { svc } = setup(tx);

    const bundle = await svc.exportCustomer('t1', 'c1');

    expect(bundle.subject).toEqual({ type: 'customer', id: 'c1', email: 'real@x.com' });
    expect(bundle.data.orders).toHaveLength(2);
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'EXPORT' }) }),
    );
  });
});
