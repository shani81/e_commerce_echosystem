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
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import {
  BILLING_JOBS,
  BILLING_QUEUE,
  type StripeWebhookJobData,
} from './billing.constants';

/**
 * Stripe webhook receiver (→ `POST /api/v1/webhooks/stripe`).
 *
 * `@Public()` because Stripe authenticates with an HMAC signature header, not a
 * user JWT. The route MUST verify against the RAW request body: `main.ts` boots
 * the app with `rawBody: true`, so platform-express exposes the unparsed buffer
 * as `req.rawBody`. This controller is the ONLY consumer of it — JSON
 * re-serialisation would change the bytes and break the `stripe-signature` HMAC.
 *
 * Phase 0 = skeleton: the signature check is a placeholder that asserts the
 * header + raw body are present and the webhook secret is configured. Full
 * `stripe.webhooks.constructEvent(...)` verification is wired when the Stripe SDK
 * lands. We immediately hand off to BullMQ so the HTTP response stays fast and
 * Stripe sees a 200; the worker app owns the `billing` queue processor.
 */
@Controller('webhooks')
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(
    @InjectQueue(BILLING_QUEUE) private readonly billingQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripeWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    const webhookSecret = this.config.get<string>('stripe.webhookSecret');

    // --- Signature verification (PLACEHOLDER) --------------------------------
    // Real implementation:
    //   const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    // For the skeleton we assert the preconditions so misconfiguration fails loud.
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new BadRequestException('Stripe webhook is not configured');
    }

    // `req.rawBody` is populated by the route-scoped raw parser in main.ts.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Empty webhook body');
    }

    let event: { id?: string; type?: string };
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const jobData: StripeWebhookJobData = {
      eventId: event.id ?? `evt_unknown_${Date.now()}`,
      eventType: event.type ?? 'unknown',
      payload: event,
      receivedAt: new Date().toISOString(),
    };

    // Enqueue for async processing; dedupe on the Stripe event id (jobId) so a
    // redelivered webhook is not processed twice.
    await this.billingQueue.add(BILLING_JOBS.STRIPE_WEBHOOK, jobData, {
      jobId: jobData.eventId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });

    this.logger.log(
      `Enqueued Stripe webhook ${jobData.eventType} (${jobData.eventId})`,
    );
    return { received: true };
  }
}
