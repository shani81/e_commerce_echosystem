import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createImageEmbedder, semanticDedupeIndices, type ImageEmbedder } from '@aicos/ai-core';
import type { SampledFrame } from './frame-sampler.service';

const DEFAULT_THRESHOLD = 0.92; // cosine ≥ this → treated as the same shot

/**
 * Optional CLIP-based semantic frame dedup — the gated layer above pixel dHash.
 * Embeds the sampled frames via a configured CLIP endpoint and drops near-
 * duplicates by cosine similarity (catches the same shelf shot from a slightly
 * different angle/lighting that dHash keeps). Gated on `CLIP_EMBED_URL`; without
 * it — or on any error/shape mismatch — it returns the frames unchanged, so the
 * pipeline never regresses (same graceful-degradation contract as Gemini vision).
 */
@Injectable()
export class SemanticDeduperService {
  private readonly logger = new Logger(SemanticDeduperService.name);
  private readonly embedder: ImageEmbedder;
  private readonly threshold: number;

  constructor(config: ConfigService) {
    this.embedder = createImageEmbedder({
      url: config.get<string>('CLIP_EMBED_URL'),
      apiKey: config.get<string>('CLIP_API_KEY'),
      model: config.get<string>('CLIP_MODEL'),
    });
    const t = Number(config.get<string>('CLIP_DEDUP_THRESHOLD'));
    this.threshold = Number.isFinite(t) && t > 0 && t <= 1 ? t : DEFAULT_THRESHOLD;
  }

  /** Whether a CLIP embedding endpoint is configured. */
  get enabled(): boolean {
    return this.embedder.enabled;
  }

  /** Drop semantically near-duplicate frames; never throws, never returns empty. */
  async dedupe(frames: SampledFrame[]): Promise<SampledFrame[]> {
    if (!this.embedder.enabled || frames.length < 2) return frames;
    try {
      const vectors = await this.embedder.embed(frames.map((f) => f.image));
      if (vectors.length !== frames.length) {
        this.logger.warn(
          `semantic dedup skipped — embedder returned ${vectors.length}/${frames.length} vectors`,
        );
        return frames;
      }
      const keep = new Set(semanticDedupeIndices(vectors, this.threshold));
      const out = frames.filter((_, i) => keep.has(i));
      if (out.length > 0 && out.length < frames.length) {
        this.logger.log(`semantic dedup: ${frames.length} → ${out.length} frames (CLIP)`);
        return out;
      }
      return frames;
    } catch (err) {
      this.logger.warn(`semantic dedup skipped: ${err instanceof Error ? err.message : 'unknown'}`);
      return frames;
    }
  }
}
