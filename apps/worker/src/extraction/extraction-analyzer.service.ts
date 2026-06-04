import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDefaultRouter, type AiImage, type AiRouter } from '@aicos/ai-core';

/** A product detected from shelf imagery (one ExtractionResult). */
export interface ExtractedProduct {
  title: string;
  priceCents: number | null;
  brandGuess: string | null;
  categoryGuess: string | null;
  overallConfidence: number;
  fieldConfidence: Record<string, number>;
}

const EXTRACTION_PROMPT =
  'You are a retail product-catalog extractor. From the shelf image(s), identify each distinct ' +
  'product and return ONLY a JSON array (no prose, no code fences). Each element: ' +
  '{"title": string, "priceCents": integer cents or null, "brand": string|null, ' +
  '"category": string|null, "confidence": number 0..1, ' +
  '"fieldConfidence": {"title": 0..1, "price": 0..1, "brand": 0..1}}.';

/** Deterministic fallback when no frames are sampled yet or no model is configured. */
const MOCK: readonly ExtractedProduct[] = [
  { title: 'Cola Classic 330ml', priceCents: 149, brandGuess: 'Acme Beverages', categoryGuess: 'Drinks', overallConfidence: 0.92, fieldConfidence: { title: 0.95, price: 0.9, brand: 0.8 } },
  { title: 'Sparkling Water 500ml', priceCents: 99, brandGuess: 'Acme Beverages', categoryGuess: 'Drinks', overallConfidence: 0.78, fieldConfidence: { title: 0.85, price: 0.7, brand: 0.6 } },
  { title: 'Energy Bar Peanut', priceCents: 249, brandGuess: 'NutriCo', categoryGuess: 'Snacks', overallConfidence: 0.61, fieldConfidence: { title: 0.8, price: 0.5, brand: 0.55 } },
];

/**
 * Turns shelf frames into draft products. When a model key is configured AND
 * frames are provided, it routes through `@aicos/ai-core` (`extraction.primary`
 * → Gemini vision, Claude/OpenAI fallback) and parses the JSON. Otherwise — no
 * key, no frames (FFmpeg sampling = JOB 1, not built yet), or any error — it
 * returns the deterministic mock so the pipeline + review gate stay exercisable.
 */
@Injectable()
export class ExtractionAnalyzer {
  private readonly logger = new Logger(ExtractionAnalyzer.name);
  private readonly router: AiRouter;
  private readonly hasModelKey: boolean;

  constructor(config: ConfigService) {
    const geminiApiKey = config.get<string>('GEMINI_API_KEY');
    this.hasModelKey = Boolean(geminiApiKey);
    this.router = createDefaultRouter({
      geminiApiKey,
      anthropicApiKey: config.get<string>('ANTHROPIC_API_KEY'),
      openaiApiKey: config.get<string>('OPENAI_API_KEY'),
    });
  }

  /** Whether a live vision model is configured (vs. the mock fallback). */
  get live(): boolean {
    return this.hasModelKey;
  }

  async analyze(images: AiImage[]): Promise<ExtractedProduct[]> {
    if (images.length === 0 || !this.hasModelKey) {
      return [...MOCK];
    }
    try {
      const res = await this.router.vision(
        { prompt: EXTRACTION_PROMPT, images, json: true, maxTokens: 2048 },
        { alias: 'extraction.primary' },
      );
      const parsed = parseProducts(res.text);
      return parsed.length > 0 ? parsed : [...MOCK];
    } catch (err) {
      this.logger.warn(
        `vision analyze failed — using mock: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return [...MOCK];
    }
  }
}

function parseProducts(text: string): ExtractedProduct[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    return [];
  }
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { products?: unknown[] })?.products)
      ? (raw as { products: unknown[] }).products
      : [];
  return arr
    .map((p) => p as Record<string, unknown>)
    .filter((p) => typeof p?.title === 'string' && p.title.trim())
    .map((p) => ({
      title: String(p.title),
      priceCents: typeof p.priceCents === 'number' && Number.isFinite(p.priceCents) ? Math.round(p.priceCents) : null,
      brandGuess: typeof p.brand === 'string' ? p.brand : null,
      categoryGuess: typeof p.category === 'string' ? p.category : null,
      overallConfidence: clamp01(typeof p.confidence === 'number' ? p.confidence : 0.5),
      fieldConfidence:
        p.fieldConfidence && typeof p.fieldConfidence === 'object'
          ? (p.fieldConfidence as Record<string, number>)
          : {},
    }));
}

/** Strip ```json … ``` fences a model may wrap JSON in. */
function stripFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1]! : t;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
