import type { ConfigService } from '@nestjs/config';
import { SemanticDeduperService } from './semantic-deduper.service';
import type { SampledFrame } from './frame-sampler.service';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

const frame = (b64: string): SampledFrame => ({
  frameIndex: 0,
  timestampMs: 0,
  blurScore: null,
  image: { base64: b64, mimeType: 'image/jpeg' },
});

function embeddingsResponse(embeddings: number[][]) {
  return { ok: true, json: async () => ({ embeddings }) };
}

describe('SemanticDeduperService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('is a no-op when CLIP is not configured', async () => {
    const svc = new SemanticDeduperService(cfg({}));
    expect(svc.enabled).toBe(false);
    const frames = [frame('a'), frame('b')];
    expect(await svc.dedupe(frames)).toBe(frames); // same reference → untouched
    expect(global.fetch).toBe(realFetch);
  });

  it('drops semantically near-duplicate frames when enabled', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(embeddingsResponse([[1, 0, 0], [1, 0, 0], [0, 1, 0]])) as unknown as typeof fetch;
    const svc = new SemanticDeduperService(
      cfg({ CLIP_EMBED_URL: 'http://clip.local', CLIP_DEDUP_THRESHOLD: '0.9' }),
    );
    expect(svc.enabled).toBe(true);

    const frames = [frame('a'), frame('b'), frame('c')];
    const out = await svc.dedupe(frames);

    expect(out).toHaveLength(2); // frame 1 (dup of 0) dropped
    expect(out[0]).toBe(frames[0]);
    expect(out[1]).toBe(frames[2]);
  });

  it('returns the frames unchanged on an embedder error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;
    const svc = new SemanticDeduperService(cfg({ CLIP_EMBED_URL: 'http://clip.local' }));
    const frames = [frame('a'), frame('b')];
    expect(await svc.dedupe(frames)).toBe(frames);
  });

  it('skips dedup on a vector/frame count mismatch', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(embeddingsResponse([[1, 0, 0]])) as unknown as typeof fetch; // 1 vector, 2 frames
    const svc = new SemanticDeduperService(cfg({ CLIP_EMBED_URL: 'http://clip.local' }));
    const frames = [frame('a'), frame('b')];
    expect(await svc.dedupe(frames)).toBe(frames);
  });
});
