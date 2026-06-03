import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from './contracts';
import { ExtractionProcessor } from './extraction.processor';
import { BillingProcessor } from './billing.processor';

/**
 * Registers the worker's BullMQ queues and binds a processor to each.
 *
 * `BullModule.registerQueue` attaches to the Redis connection configured by
 * `BullModule.forRoot` in `AppModule`. Because the queue names come from
 * `@aicos/shared` (the same constants the API uses to enqueue), a job added by
 * the API lands on exactly these processors.
 */
@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.extraction },
      { name: QUEUE_NAMES.billing },
    ),
  ],
  providers: [ExtractionProcessor, BillingProcessor],
})
export class QueuesModule {}
