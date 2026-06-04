import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@aicos/shared';
import { ExtractionService } from './extraction.service';
import { ExtractionController } from './extraction.controller';
import { S3Service } from '../media/s3.service';

/**
 * AI extraction module (API/producer side). Registers the `extraction` BullMQ
 * queue to enqueue jobs; the pipeline (consumer) lives in the worker. S3Service
 * (stateless wrapper) presigns GET URLs for frame thumbnails in the review UI.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.extraction })],
  controllers: [ExtractionController],
  providers: [ExtractionService, S3Service],
})
export class ExtractionModule {}
