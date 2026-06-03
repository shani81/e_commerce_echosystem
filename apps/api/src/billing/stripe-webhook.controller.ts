import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import {
  BILLING_JOBS,
  BILLING_QUEUE,
  type StripeEventJobData,
} from './billing.constants';
import { StripeService } from './stripe.service';

/**
 * Stripe webhook receiver (→ `POST /api/v1/webhooks/stripe`).
 *
 * `@Public()` because Stripe authenticates with an HMAC signature header, not a
 * user JWT. We verify against the RAW request body: `main.ts` boots the app with
 * `rawBody: true`, so platform-express exposes the unparsed buffer as
 * `req.rawBody`. This controller is the ONLY consumer of it — JSON
 * re-serialisation would change the bytes and break the `stripe-signature` HMAC.
 *
 * Flow: verify the signature synchronously (fail loud on a bad/missing signature
 * or unconfigured secret), then hand the verified event to the `billing` BullMQ
 * queue so the HTTP response stays fast (Stripe expects a 2xx within seconds and
 * retries otherwise). The worker app owns the processor.
 */
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    @InjectQueue(BILLING_QUEUE) private readonly billingQueue: Queue,
    private readonly stripe: StripeService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    // `req.rawBody` is populated by `rawBody: true` in main.ts.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Empty webhook body');
    }

    // Real signature verification — throws 400 on a bad signature, 503 when the
    // webhook secret is unconfigured (both non-2xx, so Stripe retries).
    const event = this.stripe.constructEvent(rawBody, signature);

    const jobData: StripeEventJobData = {
      eventId: event.id,
      type: event.type,
      payload: event,
      receivedAt: new Date().toISOString(),
    };

    // Hand off for async processing. `jobId = event.id` dedupes a redelivered
    // webhook at the queue level; the worker adds a processed-event guard for
    // idempotency that survives job eviction.
    await this.billingQueue.add(BILLING_JOBS.stripeEvent, jobData, {
      jobId: event.id,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });

    this.logger.log(`Verified + enqueued Stripe webhook ${event.type} (${event.id})`);
    return { received: true };
  }
}
