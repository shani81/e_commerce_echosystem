import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './contracts';
import { ExtractionProcessor } from './extraction.processor';
import { BillingProcessor } from './billing.processor';
import { NotificationsProcessor } from './notifications.processor';
import { DsarProcessor } from './dsar.processor';
import { QueueMetricsService } from './queue-metrics.service';
import { MailService } from '../mail/mail.service';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * Registers the worker's BullMQ queues and binds a processor to each.
 *
 * `BullModule.registerQueue` attaches to the Redis connection configured by
 * `BullModule.forRoot` in `AppModule`. Because the queue names come from
 * `@aicos/shared` (the same constants the API uses to enqueue), a job added by
 * the API lands on exactly these processors. The `notifications` queue is also a
 * producer here (BillingProcessor enqueues order-confirmation emails).
 */
@Module({
  imports: [
    MetricsModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.extraction },
      { name: QUEUE_NAMES.billing },
      { name: QUEUE_NAMES.notifications },
      { name: QUEUE_NAMES.dsar },
    ),
  ],
  providers: [
    ExtractionProcessor,
    BillingProcessor,
    NotificationsProcessor,
    DsarProcessor,
    QueueMetricsService,
    MailService,
  ],
})
export class QueuesModule {}
