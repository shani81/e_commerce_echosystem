import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  AiProvider,
  ExtractionJobStatus,
  MediaStatus,
  MediaType,
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
import {
  ExtractionAnalyzer,
  enrichProducts,
  type ExtractedProduct,
} from '../extraction/extraction-analyzer.service';
import { FrameSamplerService, type SourceMedia } from '../extraction/frame-sampler.service';
import { SemanticDeduperService } from '../extraction/semantic-deduper.service';
import { BarcodeScannerService } from '../extraction/barcode-scanner.service';
import { BarcodeLookupService } from '../extraction/barcode-lookup.service';

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
    private readonly barcodeScanner: BarcodeScannerService,
    private readonly barcodeLookup: BarcodeLookupService,
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

    // Decode product barcodes from each frame (stored per-frame + fed to the
    // vision model as GTIN hints). Aligned by index with `sampled`.
    const barcodes = sampled.map((f) =>
      this.barcodeScanner.scan(Buffer.from(f.image.base64 ?? '', 'base64')),
    );
    const barcodeHints = [...new Set(barcodes.filter((b): b is string => Boolean(b)))];

    // Resolve barcodes to real products via open product DBs — so a shelf of
    // barcodes yields catalog drafts with or without vision.
    const barcodeProducts = barcodeHints.length
      ? (await Promise.all(barcodeHints.map((b) => this.barcodeLookup.lookup(b)))).filter(
          (p): p is ExtractedProduct => Boolean(p),
        )
      : [];

    // Upload each frame JPEG to object storage (best-effort) so the review UI can
    // show thumbnails. objectKey per frame, or null when upload is unavailable.
    const frameBucket = this.sampler.uploadBucket;
    const frameKeys = await Promise.all(
      sampled.map(async (f, i) => {
        if (!usingRealFrames || !frameBucket) return null;
        const key = `extractions/${claim.jobId}/frame_${String(i).padStart(3, '0')}.jpg`;
        const ok = await this.sampler.uploadFrame(key, Buffer.from(f.image.base64 ?? '', 'base64'));
        return ok ? key : null;
      }),
    );

    // tx2 — persist the frames (real or placeholder) and advance to ANALYZING.
    const frameIds = await withTenant(this.prisma.client, tenantId, async (tx) => {
      const ids: string[] = [];
      if (usingRealFrames) {
        for (let i = 0; i < sampled.length; i++) {
          const f = sampled[i]!;
          // Link the frame to its uploaded thumbnail (temp/ MediaAsset) when the
          // upload succeeded; else fall back to the source media reference.
          let mediaId = claim.media?.id ?? null;
          const key = frameKeys[i];
          if (key && frameBucket) {
            const asset = await tx.mediaAsset.create({
              data: {
                tenantId,
                type: MediaType.IMAGE,
                status: MediaStatus.READY,
                bucket: frameBucket,
                objectKey: key,
                mimeType: 'image/jpeg',
                isTemporary: true,
              },
              select: { id: true },
            });
            mediaId = asset.id;
          }
          const row = await tx.extractionFrame.create({
            data: {
              tenantId,
              jobId: claim.jobId,
              mediaId,
              frameIndex: f.frameIndex,
              timestampMs: f.timestampMs,
              blurScore: f.blurScore,
              barcode: barcodes[i] ?? null,
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
    // `analysis.live` is the authoritative "real AI ran" flag; `note` carries
    // the fallback reason (e.g. quota/HTTP error) for the review UI.
    const images: AiImage[] = sampled.map((f) => f.image);
    const analysis = await this.analyzer.analyze(images, barcodeHints);

    // Merge real sources — barcode lookups (exact GTIN) + live vision, deduped &
    // confidence-ordered. Only fall back to the deterministic mock when NEITHER
    // produced anything (so barcodes alone still give real results).
    const haveReal = analysis.live || barcodeProducts.length > 0;
    const products = haveReal
      ? enrichProducts([...barcodeProducts, ...(analysis.live ? analysis.products : [])])
      : analysis.products;
    const note = haveReal ? null : analysis.note;

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
          // Surface the fallback reason (quota/HTTP error/no-key) only when the
          // results are the mock; cleared when vision or barcode lookup produced
          // real products.
          errorMessage: note,
        },
      });
    });

    await job.updateProgress(100);
    const sources =
      [
        analysis.live ? 'vision' : null,
        barcodeProducts.length ? `${barcodeProducts.length} barcode` : null,
      ]
        .filter(Boolean)
        .join('+') || `mock (${analysis.note ?? 'fallback'})`;
    this.logger.log(
      `extraction ${extractionRunId} → ${products.length} draft results AWAITING_REVIEW ` +
        `(${frameIds.length} frames, ${sources})`,
    );
    return { extractionRunId, productsFound: products.length };
  }
}
