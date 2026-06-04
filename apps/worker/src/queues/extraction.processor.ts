import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  AiProvider,
  ExtractionJobStatus,
  ReviewDecision,
  withTenant,
  type Prisma,
} from '@aicos/db';
import type { AiImage } from '@aicos/ai-core';
import {
  EXTRACTION_JOBS,
  QUEUE_NAMES,
  type ExtractionJobData,
} from './contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ExtractionAnalyzer } from '../extraction/extraction-analyzer.service';

/**
 * Consumer for the `extraction` queue — the flagship AI product-extraction
 * pipeline (see `.ai/features/ai-product-extraction/architecture.md`).
 *
 * Real pipeline shape: QUEUED → INGESTING (sample frames) → ANALYZING (vision) →
 * MERGING → AWAITING_REVIEW, persisting ExtractionFrame + ExtractionResult +
 * ExtractionReviewItem so the review UI + accept→draft gate work end-to-end.
 * The analyze step goes through {@link ExtractionAnalyzer} → `@aicos/ai-core`
 * Gemini vision when a key + frames exist, else a deterministic mock. FFmpeg
 * frame sampling (real images to feed vision) is JOB 1, the remaining piece.
 * Idempotent: a job already AWAITING_REVIEW/PUBLISHED is skipped. No auto-publish.
 */
@Processor(QUEUE_NAMES.extraction)
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);
  private static readonly FRAME_COUNT = 6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyzer: ExtractionAnalyzer,
  ) {
    super();
  }

  async process(job: Job<ExtractionJobData>): Promise<{ extractionRunId: string; productsFound: number }> {
    if (job.name !== EXTRACTION_JOBS.run) {
      this.logger.warn(`extraction ignoring unknown job name="${job.name}"`);
      return { extractionRunId: job.data?.extractionRunId ?? '', productsFound: 0 };
    }
    const { tenantId, extractionRunId } = job.data;

    // tx1 — claim the job + sample frames (mock frames until FFmpeg/JOB 1).
    const frameIds = await withTenant(this.prisma.client, tenantId, async (tx) => {
      const j = await tx.extractionJob.findFirst({ where: { id: extractionRunId, tenantId } });
      if (!j) {
        this.logger.warn(`extraction job ${extractionRunId} not found`);
        return null;
      }
      if (
        j.status === ExtractionJobStatus.AWAITING_REVIEW ||
        j.status === ExtractionJobStatus.PUBLISHED
      ) {
        return null; // already processed
      }
      await tx.extractionJob.update({
        where: { id: j.id },
        data: { status: ExtractionJobStatus.INGESTING, startedAt: new Date() },
      });
      const ids: string[] = [];
      for (let i = 0; i < ExtractionProcessor.FRAME_COUNT; i++) {
        const f = await tx.extractionFrame.create({
          data: { tenantId, jobId: j.id, frameIndex: i, confidence: 0.9, providerUsed: AiProvider.GEMINI },
          select: { id: true },
        });
        ids.push(f.id);
      }
      await tx.extractionJob.update({
        where: { id: j.id },
        data: {
          status: ExtractionJobStatus.ANALYZING,
          framesExtracted: ExtractionProcessor.FRAME_COUNT,
          framesAnalyzed: ExtractionProcessor.FRAME_COUNT,
        },
      });
      return ids;
    });

    if (!frameIds) {
      await job.updateProgress(100);
      return { extractionRunId, productsFound: 0 };
    }

    // analyze OUTSIDE the tx (may call the vision model). No real frame images
    // yet (FFmpeg = JOB 1) → analyzer returns the mock; with frames + a key it
    // routes through ai-core Gemini vision.
    const images: AiImage[] = [];
    const products = await this.analyzer.analyze(images);

    // tx2 — persist results + review items; hand to the human review gate.
    await withTenant(this.prisma.client, tenantId, async (tx) => {
      for (const p of products) {
        const result = await tx.extractionResult.create({
          data: {
            tenantId,
            jobId: extractionRunId,
            title: p.title,
            priceCents: p.priceCents,
            currency: 'USD',
            brandGuess: p.brandGuess,
            categoryGuess: p.categoryGuess,
            overallConfidence: p.overallConfidence,
            fieldConfidence: p.fieldConfidence as Prisma.InputJsonValue,
            sourceFrameIds: frameIds.slice(0, 2) as Prisma.InputJsonValue,
            imageMediaIds: [] as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await tx.extractionReviewItem.create({
          data: { tenantId, jobId: extractionRunId, resultId: result.id, decision: ReviewDecision.PENDING },
        });
      }
      await tx.extractionJob.update({
        where: { id: extractionRunId },
        data: {
          status: ExtractionJobStatus.AWAITING_REVIEW,
          productsFound: products.length,
          completedAt: new Date(),
        },
      });
    });

    await job.updateProgress(100);
    this.logger.log(
      `extraction ${extractionRunId} → ${products.length} draft results AWAITING_REVIEW (${this.analyzer.live ? 'live' : 'mock'})`,
    );
    return { extractionRunId, productsFound: products.length };
  }
}
