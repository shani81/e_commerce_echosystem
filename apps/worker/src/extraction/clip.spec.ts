import {
  HttpImageEmbedder,
  cosineSimilarity,
  createImageEmbedder,
  semanticDedupeIndices,
  type AiImage,
} from '@aicos/ai-core';

const IMG: AiImage = { base64: 'AAAA', mimeType: 'image/jpeg' };

describe('clip pure helpers', () => {
  it('cosineSimilarity: identical → 1, orthogonal/degenerate → 0', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('semanticDedupeIndices: drops near-duplicate vectors, keeps distinct ones', () => {
    // 0 and 1 identical → drop 1; 2 orthogonal → keep.
    expect(semanticDedupeIndices([[1, 0], [1, 0], [0, 1]], 0.9)).toEqual([0, 2]);
    // All sufficiently distinct → keep everything.
    expect(semanticDedupeIndices([[1, 0], [0, 1], [1, 1]], 0.9)).toEqual([0, 1, 2]);
  });
});

describe('HttpImageEmbedder / createImageEmbedder', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('is disabled (no-op) when no URL is configured', async () => {
    const e = createImageEmbedder({});
    expect(e.enabled).toBe(false);
    expect(await e.embed([IMG])).toEqual([]);
  });

  it('POSTs images (with auth) and returns the embeddings', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ embeddings: [[1, 2, 3]] }) }) as unknown as typeof fetch;
    const e = createImageEmbedder({ url: 'http://clip.local/embed', apiKey: 'k' });
    expect(e.enabled).toBe(true);
    expect(await e.embed([IMG])).toEqual([[1, 2, 3]]);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('http://clip.local/embed');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
  });

  it('throws on a non-ok response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;
    await expect(new HttpImageEmbedder({ url: 'http://x' }).embed([IMG])).rejects.toThrow(
      'image embed HTTP 500',
    );
  });

  it('returns [] for no images without calling the endpoint', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    expect(await new HttpImageEmbedder({ url: 'http://x' }).embed([])).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
