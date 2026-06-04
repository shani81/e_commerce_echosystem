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
import {
  EXTRACTION_JOBS,
  QUEUE_NAMES,
  type ExtractionJobData,
} from './contracts';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Consumer for the `extraction` queue — the flagship AI product-extraction
 * pipeline (see `.ai/features/ai-product-extraction/architecture.md`).
 *
 * KICKOFF: this runs the real *shape* of the pipeline against the real models —
 * QUEUED → INGESTING (sample frames) → ANALYZING (vision) → MERGING →
 * AWAITING_REVIEW, persisting ExtractionFrame + ExtractionResult +
 * ExtractionReviewItem rows so the review UI + the accept→draft-product gate work
 * end-to-end. The `analyze` step is a deterministic MOCK; the real implementation
 * samples frames with FFmpeg and routes them through `@aicos/ai-core`
 * (`extraction.primary` → Gemini vision, Claude fallback) — that swap is the only
 * change needed to go live (decisions XT-01..XT-08). Nothing auto-publishes.
 *
 * Idempotent: a job already AWAITING_REVIEW/PUBLISHED is skipped.
 */
@Processor(QUEUE_NAMES.extraction)
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);
  private static readonly FRAME_COUNT = 6;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ExtractionJobData>): Promise<{ extractionRunId: string; productsFound: number }> {
    if (job.name !== EXTRACTION_JOBS.run) {
      this.logger.warn(`extraction ignoring unknown job name="${job.name}"`);
      return { extractionRunId: job.data?.extractionRunId ?? '', productsFound: 0 };
    }
    const { tenantId, extractionRunId } = job.data;

    const outcome = await withTenant(this.prisma.client, tenantId, async (tx) => {
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

      // --- sample (MOCK frames; real: FFmpeg sampling + pHash dedup) ---
      const frameIds: string[] = [];
      for (let i = 0; i < ExtractionProcessor.FRAME_COUNT; i++) {
        const f = await tx.extractionFrame.create({
          data: {
            tenantId,
            jobId: j.id,
            frameIndex: i,
            confidence: 0.9,
            providerUsed: AiProvider.GEMINI,
          },
          select: { id: true },
        });
        frameIds.push(f.id);
      }
      await tx.extractionJob.update({
        where: { id: j.id },
        data: {
          status: ExtractionJobStatus.ANALYZING,
          framesExtracted: ExtractionProcessor.FRAME_COUNT,
          framesAnalyzed: ExtractionProcessor.FRAME_COUNT,
        },
      });

      // --- analyze (MOCK; real: ai-core vision over frame batches) ---
      for (const p of MOCK_PRODUCTS) {
        const result = await tx.extractionResult.create({
          data: {
            tenantId,
            jobId: j.id,
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
          data: { tenantId, jobId: j.id, resultId: result.id, decision: ReviewDecision.PENDING },
        });
      }

      // --- merge + hand to the human review gate ---
      await tx.extractionJob.update({
        where: { id: j.id },
        data: {
          status: ExtractionJobStatus.AWAITING_REVIEW,
          productsFound: MOCK_PRODUCTS.length,
          completedAt: new Date(),
        },
      });
      return { productsFound: MOCK_PRODUCTS.length };
    });

    await job.updateProgress(100);
    const found = outcome?.productsFound ?? 0;
    this.logger.log(`extraction ${extractionRunId} → ${found} draft results AWAITING_REVIEW`);
    return { extractionRunId, productsFound: found };
  }
}

interface MockProduct {
  title: string;
  priceCents: number;
  brandGuess: string;
  categoryGuess: string;
  overallConfidence: number;
  fieldConfidence: Record<string, number>;
}

/**
 * Deterministic stand-in for the vision model's output (one entry per detected
 * product, with per-field confidence driving the review UI's triage bands). The
 * real pipeline replaces this with `@aicos/ai-core` vision calls over the frames.
 */
const MOCK_PRODUCTS: readonly MockProduct[] = [
  { title: 'Cola Classic 330ml', priceCents: 149, brandGuess: 'Acme Beverages', categoryGuess: 'Drinks', overallConfidence: 0.92, fieldConfidence: { title: 0.95, price: 0.9, brand: 0.8 } },
  { title: 'Sparkling Water 500ml', priceCents: 99, brandGuess: 'Acme Beverages', categoryGuess: 'Drinks', overallConfidence: 0.78, fieldConfidence: { title: 0.85, price: 0.7, brand: 0.6 } },
  { title: 'Energy Bar Peanut', priceCents: 249, brandGuess: 'NutriCo', categoryGuess: 'Snacks', overallConfidence: 0.61, fieldConfidence: { title: 0.8, price: 0.5, brand: 0.55 } },
];
