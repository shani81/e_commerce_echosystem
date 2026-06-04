// CLIP-style image embeddings — the gated semantic-similarity layer for the
// extraction pipeline. Like the Gemini vision path, the model lives behind a
// configured endpoint (a CLIP inference server); without one this is disabled
// and callers fall back to pixel-level (dHash) dedup. No native/model deps here.

import type { AiImage } from './types';

/** Embeds shelf frames into vectors for semantic similarity (CLIP-style). */
export interface ImageEmbedder {
  /** Whether a backing model/endpoint is configured. */
  readonly enabled: boolean;
  /** One vector per input image; `[]` when disabled (callers must handle). */
  embed(images: AiImage[]): Promise<number[][]>;
}

export interface ImageEmbedderConfig {
  /** Embeddings endpoint (a CLIP inference server). Unset → disabled. */
  url?: string;
  /** Optional bearer token for the endpoint. */
  apiKey?: string;
  /** Model id to request (server-specific; default `clip`). */
  model?: string;
}

/** Cosine similarity of two vectors (0 if either is degenerate / mismatched). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Greedy semantic dedup: keep an item only when its max cosine similarity to all
 * already-kept items is below `threshold`. Returns ascending kept indices —
 * mirrors the pixel-level `dedupeByHash`, but on embeddings (catches the same
 * shelf shot from a slightly different angle/lighting that dHash would miss).
 */
export function semanticDedupeIndices(vectors: number[][], threshold: number): number[] {
  const kept: number[] = [];
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i] ?? [];
    if (kept.every((k) => cosineSimilarity(vectors[k] ?? [], v) < threshold)) kept.push(i);
  }
  return kept;
}

const DISABLED: ImageEmbedder = {
  enabled: false,
  async embed() {
    return [];
  },
};

/**
 * HTTP-backed embedder. POSTs base64 frames to a CLIP inference server and reads
 * back one vector each. Contract (server-agnostic, documented in the runbook):
 *   → `{ model, images: [{ mimeType, data: <base64> }] }`
 *   ← `{ embeddings: number[][] }`
 */
export class HttpImageEmbedder implements ImageEmbedder {
  readonly enabled = true;
  private readonly url: string;
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(config: ImageEmbedderConfig & { url: string }) {
    this.url = config.url;
    this.apiKey = config.apiKey;
    this.model = config.model ?? 'clip';
  }

  async embed(images: AiImage[]): Promise<number[][]> {
    if (images.length === 0) return [];
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.model,
        images: images.map((i) => ({ mimeType: i.mimeType, data: i.base64 ?? '' })),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`image embed HTTP ${res.status}: ${detail.slice(0, 200)}`);
    }
    const json = (await res.json()) as { embeddings?: number[][] };
    return Array.isArray(json.embeddings) ? json.embeddings : [];
  }
}

/** A configured {@link HttpImageEmbedder} when a URL is set, else a disabled no-op. */
export function createImageEmbedder(config: ImageEmbedderConfig = {}): ImageEmbedder {
  if (!config.url) return DISABLED;
  return new HttpImageEmbedder({ ...config, url: config.url });
}
