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
import { FrameSamplerService, type SourceMedia } from '../extraction/frame-sampler.service';
import { SemanticDeduperService } from '../extraction/semantic-deduper.service';

/**
 * Consumer for the `extraction` queue — the flagship AI product-extraction
 * pipeline (see `.ai/features/ai-product-extraction/architecture.md`).
 *
 * Real pipeline shape: QUEUED → INGESTING (sample frames) → ANALYZING (vision) →
 * MERGING → AWAITING_REVIEW, persisting ExtractionFrame + ExtractionResult +
 * ExtractionReviewItem so the review UI + accept→draft gate work end-to-end.
 * INGESTING uses {@link FrameSamplerService} to pull the source media from S3 and
 * sample real frames with ffmpeg; the analyze step goes through
 * {@link ExtractionAnalyzer} → `@aicos/ai-core` Gemini vision when a key + frames
 * exist, else a deterministic mock. When no media is attached or sampling can't
 * run, it falls back to placeholder frames + the mock so the gate stays testable.
 * Idempotent: a job already AWAITING_REVIEW/PUBLISHED is skipped. No auto-publish.
 */
@Processor(QUEUE_NAMES.extraction)
export class ExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(ExtractionProcessor.name);
  private static readonly FRAME_COUNT = 6;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyzer: ExtractionAnalyzer,
    private readonly sampler: FrameSamplerService,
    private readonly semanticDeduper: SemanticDeduperService,
  ) {
    super();
  }

  async process(job: Job<ExtractionJobData>): Promise<{ extractionRunId: string; productsFound: number }> {
    if (job.name !== EXTRACTION_JOBS.run) {
      this.logger.warn(`extraction ignoring unknown job name="${job.name}"`);
      return { extractionRunId: job.data?.extractionRunId ?? '', productsFound: 0 };
    }
    const { tenantId, extractionRunId } = job.data;

    // tx1 — claim the job, mark INGESTING, and read the source media to sample.
    const claim = await withTenant(this.prisma.client, tenantId, async (tx) => {
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
      let media: SourceMedia | null = null;
      if (j.sourceMediaId) {
        media = await tx.mediaAsset.findFirst({
          where: { id: j.sourceMediaId, tenantId },
          select: { id: true, bucket: true, objectKey: true, mimeType: true, type: true },
        });
      }
      return { jobId: j.id, media };
    });

    if (!claim) {
      await job.updateProgress(100);
      return { extractionRunId, productsFound: 0 };
    }

    // Sample real frames OUTSIDE any tx (S3 download + ffmpeg are slow and must
    // not hold the RLS-scoped transaction open). Empty result → no media, sampler
    // unavailable, or a decode error → deterministic-mock fallback below. Then an
    // optional CLIP semantic-dedup pass (gated; no-op when not configured).
    const sampledRaw = claim.media
      ? await this.sampler.sample(claim.media, ExtractionProcessor.FRAME_COUNT)
      : [];
    const sampled = await this.semanticDeduper.dedupe(sampledRaw);
    const usingRealFrames = sampled.length > 0;

    // tx2 — persist the frames (real or placeholder) and advance to ANALYZING.
    const frameIds = await withTenant(this.prisma.client, tenantId, async (tx) => {
      const ids: string[] = [];
      if (usingRealFrames) {
        for (const f of sampled) {
          const row = await tx.extractionFrame.create({
            data: {
              tenantId,
              jobId: claim.jobId,
              mediaId: claim.media?.id ?? null,
              frameIndex: f.frameIndex,
              timestampMs: f.timestampMs,
              blurScore: f.blurScore,
              providerUsed: AiProvider.GEMINI,
            },
            select: { id: true },
          });
          ids.push(row.id);
        }
      } else {
        // No real media (or sampling unavailable) → placeholder frames keep the
        // pipeline and human-review gate exercisable.
        for (let i = 0; i < ExtractionProcessor.FRAME_COUNT; i++) {
          const row = await tx.extractionFrame.create({
            data: { tenantId, jobId: claim.jobId, frameIndex: i, confidence: 0.9, providerUsed: AiProvider.GEMINI },
            select: { id: true },
          });
          ids.push(row.id);
        }
      }
      await tx.extractionJob.update({
        where: { id: claim.jobId },
        data: {
          status: ExtractionJobStatus.ANALYZING,
          framesExtracted: ids.length,
          framesAnalyzed: ids.length,
        },
      });
      return ids;
    });

    // analyze OUTSIDE the tx (may call the vision model). Real frame images +
    // a model key → ai-core Gemini vision; otherwise the deterministic mock.
    const images: AiImage[] = sampled.map((f) => f.image);
    const products = await this.analyzer.analyze(images);

    // tx3 — persist results + review items; hand to the human review gate.
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
    const mode = usingRealFrames ? (this.analyzer.live ? 'live vision' : 'mock (no AI key)') : 'mock (no frames)';
    this.logger.log(
      `extraction ${extractionRunId} → ${products.length} draft results AWAITING_REVIEW ` +
        `(${frameIds.length} frames, ${mode})`,
    );
    return { extractionRunId, productsFound: products.length };
  }
}
