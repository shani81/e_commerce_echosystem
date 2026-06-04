import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@aicos/shared';
import { NotificationsService } from './notifications.service';

/**
 * Notifications producer module. Registers the `notifications` BullMQ queue
 * (producer side); the consumer/processor + SMTP delivery live in the worker.
 * Exported so any domain module (shipping, returns, …) can send transactional
 * email by importing this module and injecting NotificationsService.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_NAMES.notifications })],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
