import type { ConfigService } from '@nestjs/config';
import type { AiImage } from '@aicos/ai-core';
import { ExtractionAnalyzer, enrichProducts } from './extraction-analyzer.service';

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
    expect(out.live).toBe(false);
    expect(out.products).toHaveLength(3);
    expect(out.products[0]?.title).toContain('Cola');
    expect(out.note).toMatch(/no ai model key/i);
  });

  it('returns the mock when there are no frames (even with a key)', async () => {
    const a = new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' }));
    expect(a.live).toBe(true);
    const out = await a.analyze([]);
    expect(out.products).toHaveLength(3);
    expect(out.live).toBe(false);
  });

  it('parses Gemini vision JSON when key + frames are present', async () => {
    const products = [
      { title: 'Tea 250ml', priceCents: 199, brand: 'Acme', category: 'Drinks', confidence: 0.88, fieldConfidence: { title: 0.9, price: 0.8 } },
    ];
    global.fetch = jest.fn().mockResolvedValue(geminiOk(JSON.stringify(products))) as unknown as typeof fetch;

    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);

    expect(out.live).toBe(true);
    expect(out.products).toHaveLength(1);
    expect(out.products[0]?.title).toBe('Tea 250ml');
    expect(out.products[0]?.priceCents).toBe(199);
    expect(out.products[0]?.overallConfidence).toBeCloseTo(0.88);
  });

  it('strips code fences around the JSON', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(geminiOk('```json\n[{"title":"Widget","confidence":0.5}]\n```')) as unknown as typeof fetch;
    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);
    expect(out.products[0]?.title).toBe('Widget');
    expect(out.products[0]?.priceCents).toBeNull();
  });

  it('falls back to the mock on a vision error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;
    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);
    expect(out.products).toHaveLength(3); // mock
    expect(out.live).toBe(false);
    expect(out.note).toMatch(/AI unavailable/i);
  });

  it('dedupes vision products by title (keeps most confident) and orders best-first', async () => {
    const products = [
      { title: ' Cola ', priceCents: 149, confidence: 0.6, fieldConfidence: {} },
      { title: 'cola', priceCents: 150, confidence: 0.9, fieldConfidence: {} },
      { title: 'Water', priceCents: 99, confidence: 0.7, fieldConfidence: {} },
      { title: '   ', confidence: 0.99, fieldConfidence: {} }, // empty → dropped
    ];
    global.fetch = jest.fn().mockResolvedValue(geminiOk(JSON.stringify(products))) as unknown as typeof fetch;

    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);

    expect(out.live).toBe(true);
    expect(out.products.map((p) => p.title)).toEqual(['cola', 'Water']); // deduped, empty dropped, ordered
    expect(out.products[0]?.overallConfidence).toBeCloseTo(0.9);
    expect(out.products[0]?.priceCents).toBe(150); // the more-confident instance won
  });

  it('passes decoded barcodes to the model as hints', async () => {
    const fetchMock = jest.fn().mockResolvedValue(geminiOk('[{"title":"X","confidence":0.9}]'));
    global.fetch = fetchMock as unknown as typeof fetch;

    await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG], ['5901234123457']);

    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string);
    const promptText = body.contents[0].parts[0].text as string;
    expect(promptText).toContain('5901234123457');
    // Thinking disabled + headroom so 2.5-flash returns clean, untruncated JSON.
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.maxOutputTokens).toBe(4096);
  });

  it('parses a vision-read barcode (and rejects non-codes)', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      geminiOk(
        JSON.stringify([
          { title: 'Faxe Kondi', brand: 'Faxe', barcode: '5741000129654', confidence: 0.9, fieldConfidence: {} },
          { title: 'No code', barcode: 'not-a-barcode', confidence: 0.8, fieldConfidence: {} },
        ]),
      ),
    ) as unknown as typeof fetch;

    const out = await new ExtractionAnalyzer(cfg({ GEMINI_API_KEY: 'k' })).analyze([IMG]);
    expect(out.products.find((p) => p.title === 'Faxe Kondi')?.barcode).toBe('5741000129654');
    expect(out.products.find((p) => p.title === 'No code')?.barcode).toBeNull();
  });
});

describe('enrichProducts (unit)', () => {
  it('normalizes whitespace, dedupes by title, and sorts by confidence', () => {
    const out = enrichProducts([
      { title: 'A  B', priceCents: 1, brandGuess: null, categoryGuess: null, overallConfidence: 0.5, fieldConfidence: {} },
      { title: 'a b', priceCents: 2, brandGuess: null, categoryGuess: null, overallConfidence: 0.8, fieldConfidence: {} },
      { title: 'Zed', priceCents: 3, brandGuess: null, categoryGuess: null, overallConfidence: 0.9, fieldConfidence: {} },
    ]);
    expect(out.map((p) => p.title)).toEqual(['Zed', 'a b']); // 'A  B'/'a b' merged → most confident (0.8)
    expect(out[1]?.priceCents).toBe(2);
  });
});
