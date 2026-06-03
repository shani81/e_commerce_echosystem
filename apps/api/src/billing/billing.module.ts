import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { StripeWebhookController } from './stripe-webhook.controller';
import { BILLING_QUEUE } from './billing.constants';

/**
 * Billing module — read APIs for plans/subscription and the Stripe webhook
 * receiver. Registers the `billing` BullMQ queue (producer side); the consumer
 * (processor) lives in the worker app and is intentionally NOT defined here.
 */
@Module({
  imports: [BullModule.registerQueue({ name: BILLING_QUEUE })],
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
