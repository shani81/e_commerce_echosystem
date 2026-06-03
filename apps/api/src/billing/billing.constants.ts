/**
 * Billing BullMQ contract.
 *
 * The canonical queue/job names + payload shapes live in `@aicos/shared` so the
 * API (producer) and the worker (consumer) stay in lockstep — a job enqueued
 * here is typed and named exactly as the worker's processor expects. This module
 * just re-exports them (plus the `BILLING_QUEUE` alias) for local imports.
 */
import { QUEUE_NAMES } from '@aicos/shared';

export { QUEUE_NAMES, BILLING_JOBS, type StripeEventJobData } from '@aicos/shared';

/** The billing queue name (alias of `QUEUE_NAMES.billing`). */
export const BILLING_QUEUE = QUEUE_NAMES.billing;
