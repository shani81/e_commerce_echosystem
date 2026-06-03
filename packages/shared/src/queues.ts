/**
 * Queue + job contracts shared between the API (producers) and the worker
 * (consumers). Keeping these names and payload shapes in one place guarantees a
 * job enqueued by `apps/api` is received and typed identically by `apps/worker`.
 */

/** BullMQ queue names. Used by both the producer (API) and consumer (worker). */
export const QUEUE_NAMES = {
  /** Flagship AI product-extraction pipeline (video/photo → draft products). */
  extraction: 'extraction',
  /** Billing side-effects, primarily Stripe webhook fan-out. */
  billing: 'billing',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Named stages of the extraction pipeline (see
 * `.ai/features/ai-product-extraction/architecture.md`, JOB 1→6). Phase 0 runs
 * them as no-op steps; each becomes a real BullMQ job in later phases.
 */
export const EXTRACTION_STAGES = [
  'validate', // Stage 0 — Upload & Validation
  'sample', // Stage 1 — Frame Sampling (FFmpeg)
  'analyze', // Stage 2 — Frame Analysis (fan-out ×N)
  'refine', // Stage 3 — Refine (low-confidence only)
  'merge', // Stage 4 — Merge (flow gate)
  'enrich', // Stage 5 — Enrich
  'publish', // Stage 6 — Publish (human-triggered)
] as const;

export type ExtractionStage = (typeof EXTRACTION_STAGES)[number];

/** Job names handled on the `extraction` queue. */
export const EXTRACTION_JOBS = {
  /** Demo no-op that walks every pipeline stage without calling any model. */
  run: 'extraction.run',
} as const;

/** Job names handled on the `billing` queue. */
export const BILLING_JOBS = {
  /** A verified Stripe webhook event handed off by the API for async handling. */
  stripeEvent: 'stripe.event',
} as const;

/** Payload for an `extraction.run` job. */
export interface ExtractionJobData {
  /** Owning tenant — every pipeline side-effect must be tenant-scoped. */
  tenantId: string;
  /** The ExtractionRun aggregate this job advances. */
  extractionRunId: string;
  /** S3 ETag of the uploaded asset; part of the idempotency key. */
  s3ETag: string;
  /** Video segment / photo-batch index being processed (0 for whole-asset). */
  segmentIndex?: number;
}

/** Payload for a `stripe.event` job. */
export interface StripeEventJobData {
  /** Stripe event id (`evt_...`); the natural idempotency key. */
  eventId: string;
  /** Stripe event type, e.g. `invoice.paid`, `customer.subscription.updated`. */
  type: string;
  /** Tenant resolved from the event's customer/metadata, when known. */
  tenantId?: string;
}

/**
 * Deterministic BullMQ job id (decision XT-10): BullMQ silently ignores `add()`
 * for an id that already exists (waiting/active/completed), giving safe
 * at-least-once redelivery with no extra Redis bookkeeping. Producers and the
 * worker MUST derive ids the same way, so the helper lives here.
 */
export function extractionJobId(
  tenantId: string,
  s3ETag: string,
  segmentIndex: number,
  stage: ExtractionStage,
): string {
  return `${tenantId}:${s3ETag}:${segmentIndex}:${stage}`;
}
