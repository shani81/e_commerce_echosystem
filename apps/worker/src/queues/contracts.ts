/**
 * Queue + job contracts for the worker's processors.
 *
 * These names and payload shapes are the wire contract between the API
 * (producer) and this worker (consumer): a job the API enqueues under these
 * queue/job names, with this payload, is what the processors below receive.
 * They are kept self-contained in the worker so the build never depends on the
 * in-flight internal layout of `@aicos/shared`; when `@aicos/shared` publishes a
 * stable queue surface these can re-export from it without touching call sites.
 */

/** BullMQ queue names. Must match the names the API enqueues to. */
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
 * worker MUST derive ids the same way.
 *
 * NOTE: BullMQ rejects custom job ids containing ":" (it reserves the colon for
 * its own Redis key namespacing), so the parts are joined with "__".
 */
export function extractionJobId(
  tenantId: string,
  s3ETag: string,
  segmentIndex: number,
  stage: ExtractionStage,
): string {
  return ['x', tenantId, s3ETag, String(segmentIndex), stage].join('__');
}
