import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  NOTIFICATION_JOBS,
  QUEUE_NAMES,
  type NotificationJobData,
} from '@aicos/shared';
import { NotificationChannel, type Prisma } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';

export interface EnqueueNotification {
  tenantId: string;
  /** Template key the worker renders (e.g. 'order_confirmation'). */
  template: string;
  toAddress: string | null | undefined;
  subject?: string;
  payload?: Prisma.InputJsonValue;
  refType?: string;
  refId?: string;
}

/**
 * Producer for transactional notifications. Persists a Notification row (audit +
 * idempotency anchor) then enqueues a `notification.send` job; the worker renders
 * the template and delivers it over SMTP. A no-op when there's no destination.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.notifications) private readonly queue: Queue,
  ) {}

  async enqueue(n: EnqueueNotification): Promise<void> {
    if (!n.toAddress) return;
    const row = await this.prisma.forTenant(n.tenantId, (tx) =>
      tx.notification.create({
        data: {
          tenantId: n.tenantId,
          channel: NotificationChannel.EMAIL,
          template: n.template,
          toAddress: n.toAddress ?? null,
          subject: n.subject ?? null,
          payload: n.payload ?? {},
          refType: n.refType ?? null,
          refId: n.refId ?? null,
        },
        select: { id: true },
      }),
    );

    const data: NotificationJobData = { tenantId: n.tenantId, notificationId: row.id };
    await this.queue.add(NOTIFICATION_JOBS.send, data, {
      jobId: `notif__${row.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }
}
