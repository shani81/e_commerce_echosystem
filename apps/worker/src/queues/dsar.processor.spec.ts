jest.mock('@aicos/db', () => ({
  __esModule: true,
  ...jest.requireActual('@aicos/db'),
  withTenant: jest.fn(),
  withSystem: jest.fn(),
}));

import type { Job } from 'bullmq';
import { AuditAction, DsarStatus, withTenant } from '@aicos/db';
import { DsarProcessor } from './dsar.processor';
import { DSAR_JOBS, type DsarJobData } from './contracts';
import type { PrismaService } from '../prisma/prisma.service';

const wt = withTenant as jest.Mock;

interface Tx {
  dsarRequest: { findFirst: jest.Mock; update: jest.Mock };
  customer: { findFirst: jest.Mock; update: jest.Mock };
  order: { updateMany: jest.Mock; count: jest.Mock };
  address: { updateMany: jest.Mock };
  auditLog: { create: jest.Mock };
}

function makeJob(data: Partial<DsarJobData>, name: string = DSAR_JOBS.process): Job<DsarJobData> {
  return { name, data } as unknown as Job<DsarJobData>;
}

describe('DsarProcessor', () => {
  let tx: Tx;
  let proc: DsarProcessor;

  beforeEach(() => {
    tx = {
      dsarRequest: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      customer: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }), count: jest.fn().mockResolvedValue(0) },
      address: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    wt.mockImplementation((_c: unknown, _t: string, fn: (tx: Tx) => unknown) => fn(tx));
    proc = new DsarProcessor({ client: {} } as unknown as PrismaService);
  });

  it('ERASURE pseudonymizes the customer, audits ERASE, and completes', async () => {
    tx.dsarRequest.findFirst.mockResolvedValue({ id: 'd1', type: 'ERASURE', status: 'RECEIVED', subjectEmail: 'x@y.com' });
    tx.customer.findFirst.mockResolvedValue({ id: 'c1' });
    tx.order.updateMany.mockResolvedValue({ count: 1 });

    const res = await proc.process(makeJob({ tenantId: 't1', dsarRequestId: 'd1' }));

    expect(tx.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: AuditAction.ERASE }) }),
    );
    expect(tx.dsarRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: DsarStatus.COMPLETED }) }),
    );
    expect(res.handled).toBe(true);
  });

  it('EXPORT audits EXPORT and completes (no mutation)', async () => {
    tx.dsarRequest.findFirst.mockResolvedValue({ id: 'd2', type: 'EXPORT', status: 'RECEIVED', subjectEmail: 'x@y.com' });
    tx.order.count.mockResolvedValue(3);
    tx.customer.findFirst.mockResolvedValue({ id: 'c1' });

    await proc.process(makeJob({ tenantId: 't1', dsarRequestId: 'd2' }));

    expect(tx.customer.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: AuditAction.EXPORT }) }),
    );
    expect(tx.dsarRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: DsarStatus.COMPLETED }) }),
    );
  });

  it('skips an already-COMPLETED request', async () => {
    tx.dsarRequest.findFirst.mockResolvedValue({ id: 'd3', type: 'EXPORT', status: 'COMPLETED', subjectEmail: 'x@y.com' });
    await proc.process(makeJob({ tenantId: 't1', dsarRequestId: 'd3' }));
    expect(tx.dsarRequest.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('ignores an unknown job name', async () => {
    const res = await proc.process(makeJob({}, 'other.job'));
    expect(res.handled).toBe(false);
  });
});
