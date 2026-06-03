/**
 * BullMQ contract for billing. The queue name and job names are the integration
 * boundary with the worker app (which owns the processor — NOT created here).
 * Keep these stable; changing them requires a coordinated worker deploy.
 */
export const BILLING_QUEUE = 'billing';

export const BILLING_JOBS = {
  STRIPE_WEBHOOK: 'stripe-webhook',
} as const;

/** Payload enqueued for each received Stripe webhook event. */
export interface StripeWebhookJobData {
  /** Stripe event id (used by the worker for idempotency). */
  eventId: string;
  eventType: string;
  /** Raw event JSON as received (already signature-verified at enqueue time). */
  payload: unknown;
  receivedAt: string;
}
