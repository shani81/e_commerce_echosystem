import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  EXTRACTION_STAGES,
  QUEUE_NAMES,
  type ExtractionJobData,
  type ExtractionStage,
} from './contracts';
// Runtime import (NOT `import type`): Nest's DI needs the class reference in the
// emitted decorator metadata to resolve this constructor injection.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consumer for the `extraction` queue — the flagship AI product-extraction
 * pipeline (see `.ai/features/ai-product-extraction/architecture.md`).
 *
 * PHASE 0: this is a deliberate stub. It walks the real pipeline stage names
 * (Stage 0→6: validate → sample → analyze → refine → merge → enrich → publish)
 * as no-op steps and calls NO model / FFmpeg / S3. It exists so a job enqueued
 * by the API is genuinely received, typed, and acked here; later phases replace
 * each step with a real BullMQ sub-job.
 */
@Processor(QUEUE_NAMES.extraction)
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ExtractionJobData>): Promise<{
    extractionRunId: string;
    stagesCompleted: ExtractionStage[];
  }> {
    const { tenantId, extractionRunId, s3ETag, segmentIndex = 0 } = job.data;

    // Idempotency guard: BullMQ already dedups by deterministic jobId
    // (decision XT-10), but processors must also be safe under at-least-once
    // redelivery. A real implementation reads pipeline state for this
    // (tenantId, s3ETag, segmentIndex) and skips stages already persisted.
    // The stub is naturally idempotent — every step is a pure no-op.
    this.logger.log(
      `extraction received job=${job.id} run=${extractionRunId} tenant=${tenantId} etag=${s3ETag} segment=${segmentIndex}`,
    );

    // Prove the DB layer is wired without touching tenant data.
    // void to satisfy no-unused; the connection is live via PrismaService.
    void this.prisma;

    const stagesCompleted: ExtractionStage[] = [];
    for (const stage of EXTRACTION_STAGES) {
      // No-op stage: in later phases each becomes a real sub-job
      // (FFmpeg sampling, vision LLM, CLIP merge, enrichment, publish).
      this.logger.debug(`  stage "${stage}" — no-op (phase 0 stub)`);
      stagesCompleted.push(stage);
      await job.updateProgress(
        Math.round((stagesCompleted.length / EXTRACTION_STAGES.length) * 100),
      );
    }

    this.logger.log(
      `extraction completed job=${job.id} run=${extractionRunId} stages=${stagesCompleted.length}`,
    );
    return { extractionRunId, stagesCompleted };
  }
}
