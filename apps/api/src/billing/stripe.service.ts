import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin wrapper over the Stripe SDK: exposes the configured client and verifies
 * inbound webhook signatures against the RAW request body.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: Stripe;
  private readonly webhookSecret?: string;
  private readonly apiKeyConfigured: boolean;

  constructor(config: ConfigService) {
    // The API key is NOT used to verify webhook signatures (`constructEvent`
    // only needs the webhook signing secret), but the SDK constructor requires a
    // non-empty key.
    // `||` (not `??`): STRIPE_SECRET_KEY may be present-but-empty in .env, and
    // the Stripe SDK constructor throws on an empty key.
    const apiKey = config.get<string>('stripe.secretKey') || 'sk_unconfigured';
    this.apiKeyConfigured = apiKey !== 'sk_unconfigured';
    this.stripe = new Stripe(apiKey);
    this.webhookSecret = config.get<string>('stripe.webhookSecret');
  }

  get client(): Stripe {
    return this.stripe;
  }

  /** True when STRIPE_WEBHOOK_SECRET is set (inbound webhooks can be verified). */
  get isConfigured(): boolean {
    return Boolean(this.webhookSecret);
  }

  /**
   * True when a real STRIPE_SECRET_KEY is set (outbound API calls — Checkout
   * sessions, Connect accounts, refunds — will work). Services guard on this to
   * degrade gracefully (503) instead of calling Stripe with `sk_unconfigured`.
   */
  get isApiConfigured(): boolean {
    return this.apiKeyConfigured;
  }

  /** Throw a 503 when outbound Stripe calls are not configured. */
  assertApiConfigured(): void {
    if (!this.apiKeyConfigured) {
      this.logger.error('STRIPE_SECRET_KEY is not configured');
      throw new ServiceUnavailableException('Stripe is not configured');
    }
  }

  /**
   * Verify a Stripe webhook against the raw body + `stripe-signature` header and
   * return the typed event. Throws 503 when unconfigured (so Stripe retries) and
   * 400 on an invalid/expired signature.
   */
  constructEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      throw new ServiceUnavailableException('Stripe webhooks are not configured');
    }
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'signature verification failed';
      this.logger.warn(`Rejected Stripe webhook: ${message}`);
      throw new BadRequestException('Invalid Stripe signature');
    }
  }
}
