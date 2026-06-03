/**
 * Queue + job contracts for the worker's processors.
 *
 * Re-exported from `@aicos/shared` — the single source of truth shared with the
 * API (producer) — so a job the API enqueues is named, typed, and id-derived
 * identically here (consumer). Existing processor imports from './contracts'
 * keep working unchanged.
 */
export {
  QUEUE_NAMES,
  type QueueName,
  EXTRACTION_STAGES,
  type ExtractionStage,
  EXTRACTION_JOBS,
  BILLING_JOBS,
  NOTIFICATION_JOBS,
  DSAR_JOBS,
  type ExtractionJobData,
  type StripeEventJobData,
  type NotificationJobData,
  type DsarJobData,
  extractionJobId,
} from '@aicos/shared';
