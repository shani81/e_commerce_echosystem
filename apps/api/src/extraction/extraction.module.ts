import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@aicos/shared';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';

/**
 * AI extraction module (API/producer side). Registers the `extraction` BullMQ
 * queue to enqueue jobs; the pipeline (consumer) lives in the worker.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.extraction })],
  controllers: [ExtractionController],
  providers: [ExtractionService],
})
export class ExtractionModule {}
