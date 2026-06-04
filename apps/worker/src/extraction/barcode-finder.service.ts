import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDefaultRouter, type AiImage, type AiRouter } from '@aicos/ai-core';

// Agent #1 of the barcode-first pipeline. A FOCUSED vision call whose only job is
// to read the digit string under each barcode — far more reliable than asking the
// general product extractor to read codes while it's busy naming products. The
// digits then drive the authoritative GTIN lookup (name/brand/image), so we don't
// rely on the model's product *guess*.
const BARCODE_PROMPT =
  'You are a barcode reader. From the image(s), read every product barcode — the row of digits ' +
  'printed beneath a UPC/EAN/GTIN barcode. Return ONLY a JSON array of the digit strings (no other ' +
  'text, no prose, no code fences), e.g. ["5741000109151"]. Return [] if no barcode digits are legible.';

@Injectable()
export class BarcodeFinderService {
  private readonly logger = new Logger(BarcodeFinderService.name);
  private readonly router: AiRouter;
  private readonly hasModelKey: boolean;

  constructor(config: ConfigService) {
    const geminiApiKey = config.get<string>('GEMINI_API_KEY');
    this.hasModelKey = Boolean(geminiApiKey);
    this.router = createDefaultRouter({
      geminiApiKey,
      geminiModel: config.get<string>('GEMINI_MODEL'),
      anthropicApiKey: config.get<string>('ANTHROPIC_API_KEY'),
      openaiApiKey: config.get<string>('OPENAI_API_KEY'),
    });
  }

  /** Whether a vision model is configured. */
  get enabled(): boolean {
    return this.hasModelKey;
  }

  /** Read barcode digit strings from the frames; `[]` when disabled / on error. */
  async find(images: AiImage[]): Promise<string[]> {
    if (!this.hasModelKey || images.length === 0) return [];
    try {
      const res = await this.router.vision(
        { prompt: BARCODE_PROMPT, images, json: true, maxTokens: 512 },
        { alias: 'extraction.primary' },
      );
      return parseBarcodes(res.text);
    } catch (err) {
      this.logger.warn(
        `barcode finder failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return [];
    }
  }
}

/** Parse a JSON array of barcode strings, keeping only plausible product codes. */
export function parseBarcodes(text: string): string[] {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFence(text));
  } catch {
    return [];
  }
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { barcodes?: unknown[] })?.barcodes)
      ? (raw as { barcodes: unknown[] }).barcodes
      : [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = (typeof v === 'number' ? String(v) : typeof v === 'string' ? v : '').replace(/\D/g, '');
    if (/^\d{6,14}$/.test(s)) seen.add(s);
  }
  return [...seen];
}

function stripFence(text: string): string {
  const t = text.trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return m ? m[1]! : t;
}
