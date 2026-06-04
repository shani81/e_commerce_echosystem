import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { NotificationStatus, withTenant } from '@aicos/db';
import { NOTIFICATION_JOBS, QUEUE_NAMES, type NotificationJobData } from './contracts';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { MetricsService } from '../metrics/metrics.service';
import { renderTemplate } from '../mail/templates';

/**
 * Consumer for the `notifications` queue. Loads the persisted Notification row,
 * renders its template, and delivers it over SMTP (Mailhog in dev). Idempotent:
 * a row already SENT/DELIVERED is skipped, and the SMTP call happens OUTSIDE the
 * DB transaction so a connection isn't held during network I/O. A send failure
 * marks the row FAILED and rethrows so BullMQ retries.
 */
@Processor(QUEUE_NAMES.notifications)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly metrics: MetricsService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>): Promise<{ handled: boolean }> {
    if (job.name !== NOTIFICATION_JOBS.send) {
      this.logger.warn(`notifications ignoring unknown job name="${job.name}"`);
      return { handled: false };
    }
    const { tenantId, notificationId } = job.data;

    const n = await withTenant(this.prisma.client, tenantId, (tx) =>
      tx.notification.findFirst({ where: { id: notificationId } }),
    );
    if (!n) {
      this.logger.warn(`notification ${notificationId} not found`);
      return { handled: false };
    }
    if (n.status === NotificationStatus.SENT || n.status === NotificationStatus.DELIVERED) {
      return { handled: true };
    }
    if (!n.toAddress) {
      await withTenant(this.prisma.client, tenantId, (tx) =>
        tx.notification.update({
          where: { id: n.id },
          data: { status: NotificationStatus.FAILED, failureReason: 'no destination address' },
        }),
      );
      this.metrics.notifications.inc({ status: 'failed' });
      return { handled: true };
    }

    const payload = (n.payload ?? {}) as Record<string, unknown>;
    const rendered = renderTemplate(n.template, payload, n.subject ?? undefined);
    try {
      const messageId = await this.mail.send(n.toAddress, n.subject ?? rendered.subject, rendered.html);
      await withTenant(this.prisma.client, tenantId, (tx) =>
        tx.notification.update({
          where: { id: n.id },
          data: {
            status: NotificationStatus.SENT,
            sentAt: new Date(),
            providerMessageId: messageId,
          },
        }),
      );
      this.metrics.notifications.inc({ status: 'sent' });
      this.logger.log(`notification ${n.id} (${n.template}) → ${n.toAddress}`);
      return { handled: true };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'send failed';
      await withTenant(this.prisma.client, tenantId, (tx) =>
        tx.notification.update({
          where: { id: n.id },
          data: { status: NotificationStatus.FAILED, failureReason: reason },
        }),
      );
      this.metrics.notifications.inc({ status: 'failed' });
      throw err; // let BullMQ retry
    }
  }
}
