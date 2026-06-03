import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@aicos/shared';
import { GdprService } from './gdpr.service';
import { GdprController, PublicGdprController } from './gdpr.controller';

/**
 * GDPR / DSAR module. Registers the `dsar` queue (producer); the worker consumes
 * it to fulfil export/erasure requests on the 30-day SLA.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.dsar })],
  controllers: [GdprController, PublicGdprController],
  providers: [GdprService],
})
export class GdprModule {}
