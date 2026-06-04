jest.mock('@aicos/db', () => ({
  __esModule: true,
  ...jest.requireActual('@aicos/db'),
  withTenant: jest.fn(),
  withSystem: jest.fn(),
}));

import type { Job } from 'bullmq';
import { NotificationStatus, withTenant } from '@aicos/db';
import { NotificationsProcessor } from './notifications.processor';
import { NOTIFICATION_JOBS, type NotificationJobData } from './contracts';
import type { PrismaService } from '../prisma/prisma.service';
import type { MailService } from '../mail/mail.service';
import type { MetricsService } from '../metrics/metrics.service';

const wt = withTenant as jest.Mock;

interface Tx {
  notification: { findFirst: jest.Mock; update: jest.Mock };
}

function makeJob(data: Partial<NotificationJobData>, name: string = NOTIFICATION_JOBS.send): Job<NotificationJobData> {
  return { name, data } as unknown as Job<NotificationJobData>;
}

describe('NotificationsProcessor', () => {
  let tx: Tx;
  let send: jest.Mock;
  let proc: NotificationsProcessor;

  beforeEach(() => {
    tx = { notification: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) } };
    wt.mockImplementation((_c: unknown, _t: string, fn: (tx: Tx) => unknown) => fn(tx));
    send = jest.fn().mockResolvedValue('msg_1');
    proc = new NotificationsProcessor(
      { client: {} } as unknown as PrismaService,
      { send } as unknown as MailService,
      { notifications: { inc: jest.fn() } } as unknown as MetricsService,
    );
  });

  it('renders + sends a pending notification and marks it SENT', async () => {
    tx.notification.findFirst.mockResolvedValue({
      id: 'n1', status: NotificationStatus.PENDING, template: 'order_confirmation',
      toAddress: 'a@b.com', subject: null, payload: { orderNumber: '1001', totalCents: 1999, currency: 'USD' },
    });

    const res = await proc.process(makeJob({ tenantId: 't1', notificationId: 'n1' }));

    expect(send).toHaveBeenCalledWith('a@b.com', 'Order #1001 confirmed', expect.stringContaining('$19.99'));
    expect(tx.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.SENT, providerMessageId: 'msg_1' }) }),
    );
    expect(res.handled).toBe(true);
  });

  it('skips a notification already SENT (idempotent)', async () => {
    tx.notification.findFirst.mockResolvedValue({ id: 'n1', status: NotificationStatus.SENT });
    const res = await proc.process(makeJob({ tenantId: 't1', notificationId: 'n1' }));
    expect(send).not.toHaveBeenCalled();
    expect(tx.notification.update).not.toHaveBeenCalled();
    expect(res.handled).toBe(true);
  });

  it('marks FAILED when there is no destination address', async () => {
    tx.notification.findFirst.mockResolvedValue({ id: 'n1', status: NotificationStatus.PENDING, toAddress: null, template: 'x', payload: {} });
    await proc.process(makeJob({ tenantId: 't1', notificationId: 'n1' }));
    expect(send).not.toHaveBeenCalled();
    expect(tx.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.FAILED }) }),
    );
  });

  it('ignores an unknown job name', async () => {
    const res = await proc.process(makeJob({}, 'other.job'));
    expect(res.handled).toBe(false);
  });

  it('marks FAILED and rethrows when sending throws (BullMQ retry)', async () => {
    tx.notification.findFirst.mockResolvedValue({
      id: 'n1', status: NotificationStatus.PENDING, template: 'order_confirmation', toAddress: 'a@b.com', subject: null, payload: {},
    });
    send.mockRejectedValue(new Error('smtp down'));

    await expect(proc.process(makeJob({ tenantId: 't1', notificationId: 'n1' }))).rejects.toThrow('smtp down');
    expect(tx.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: NotificationStatus.FAILED, failureReason: 'smtp down' }) }),
    );
  });
});
