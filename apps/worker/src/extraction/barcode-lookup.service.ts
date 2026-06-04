import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExtractedProduct } from './extraction-analyzer.service';

// Open Food Facts + Open Products Facts: free, keyless, open product databases
// keyed by GTIN/UPC/EAN. Same /api/v2 shape; we try food then general products.
const DEFAULT_HOSTS = ['https://world.openfoodfacts.org', 'https://world.openproductsfacts.org'];
const TIMEOUT_MS = 5000;

interface OffProduct {
  product_name?: string;
  brands?: string;
  categories?: string;
  image_front_url?: string;
  image_url?: string;
}

/**
 * Resolves decoded barcodes to draft products via open product databases — so a
 * shelf full of barcodes yields a real catalog even without (or alongside)
 * vision. Gated on `BARCODE_LOOKUP_ENABLED` (default on; keyless), graceful on
 * every failure (unknown code, network error, timeout) → null.
 */
@Injectable()
export class BarcodeLookupService {
  private readonly logger = new Logger(BarcodeLookupService.name);
  private readonly hosts: string[];
  private readonly enabled: boolean;

  constructor(config: ConfigService) {
    const urls = config.get<string>('BARCODE_LOOKUP_URL');
    this.hosts = urls
      ? urls.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean)
      : DEFAULT_HOSTS;
    this.enabled = config.get<string>('BARCODE_LOOKUP_ENABLED') !== 'false';
  }

  /** Whether lookups are enabled + at least one host is configured. */
  get on(): boolean {
    return this.enabled && this.hosts.length > 0;
  }

  /** Resolve a GTIN/UPC/EAN to a product; null when unknown / disabled / error. */
  async lookup(barcode: string): Promise<ExtractedProduct | null> {
    if (!this.on) return null;
    const code = barcode.trim();
    if (!/^\d{6,14}$/.test(code)) return null; // numeric product codes only
    for (const host of this.hosts) {
      const product = await this.queryHost(host, code);
      if (product) return product;
    }
    return null;
  }

  private async queryHost(host: string, code: string): Promise<ExtractedProduct | null> {
    try {
      const url = `${host}/api/v2/product/${code}.json?fields=product_name,brands,categories,image_front_url,image_url`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AICOS-Extraction/1.0 (+https://aicos.local)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { status?: number; product?: OffProduct };
      const title = json.product?.product_name?.trim();
      if (json.status !== 1 || !title) return null;
      const img = json.product?.image_front_url || json.product?.image_url || '';
      return {
        title,
        priceCents: null,
        brandGuess: firstToken(json.product?.brands),
        categoryGuess: lastCategory(json.product?.categories),
        overallConfidence: 0.95, // exact GTIN match
        fieldConfidence: { title: 0.95, brand: 0.9 },
        barcode: code,
        imageUrl: img.startsWith('http') ? img : null,
      };
    } catch (err) {
      this.logger.warn(
        `barcode lookup ${code} @ ${host} failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return null;
    }
  }

  /** Download a product image into memory (≤5 MB, must be an image). Null on failure. */
  async fetchImage(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AICOS-Extraction/1.0 (+https://aicos.local)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? 'image/jpeg';
      if (!contentType.startsWith('image/')) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) return null;
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
}

/** First comma-separated brand (Open Facts joins multiple with commas). */
function firstToken(s?: string): string | null {
  const t = s?.split(',')[0]?.trim();
  return t || null;
}

/** Most-specific category (last in the hierarchy), with the `en:` lang prefix stripped. */
function lastCategory(s?: string): string | null {
  const parts = s?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
  const last = parts[parts.length - 1];
  return last ? last.replace(/^[a-z]{2}:/, '') : null;
}
