import type { ConfigService } from '@nestjs/config';
import type { AiImage } from '@aicos/ai-core';
import { ExtractionAnalyzer } from './extraction-analyzer.service';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const IMG: AiImage = { base64: 'AAAA', mimeType: 'image/png' };

function geminiOk(text: string) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    }),
  };
}

describe('ExtractionAnalyzer', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('returns the mock when no model key is configured', async () => {
    const a = new ExtractionAnalyzer(cfg({}));
    expect(a.live).toBe(false);
    const out = await a.analyze([IMG]);
    expect(out).toHaveLength(3);
    expect(out[0]?.title).toContain('Cola');
  });

  it('returns the mock when there are no frames (even with a key)', async () => {
    const a = new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' }));
    expect(a.live).toBe(true);
    expect(await a.analyze([])).toHaveLength(3);
  });

  it('parses Gemini vision JSON when key + frames are present', async () => {
    const products = [
      { title: 'Tea 250ml', priceCents: 199, brand: 'Acme', category: 'Drinks', confidence: 0.88, fieldConfidence: { title: 0.9, price: 0.8 } },
    ];
    global.fetch = jest.fn().mockResolvedValue(geminiOk(JSON.stringify(products))) as unknown as typeof fetch;

    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);

    expect(out).toHaveLength(1);
    expect(out[0]?.title).toBe('Tea 250ml');
    expect(out[0]?.priceCents).toBe(199);
    expect(out[0]?.overallConfidence).toBeCloseTo(0.88);
  });

  it('strips code fences around the JSON', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(geminiOk('```json\n[{"title":"Widget","confidence":0.5}]\n```')) as unknown as typeof fetch;
    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);
    expect(out[0]?.title).toBe('Widget');
    expect(out[0]?.priceCents).toBeNull();
  });

  it('falls back to the mock on a vision error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;
    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);
    expect(out).toHaveLength(3); // mock
  });
});
