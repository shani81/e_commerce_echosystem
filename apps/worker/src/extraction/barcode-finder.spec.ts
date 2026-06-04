import type { ConfigService } from '@nestjs/config';
import type { AiImage } from '@aicos/ai-core';
import { BarcodeFinderService, parseBarcodes } from './barcode-finder.service';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;
const IMG: AiImage = { base64: 'AAAA', mimeType: 'image/jpeg' };

function geminiOk(text: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] }),
  };
}

describe('parseBarcodes', () => {
  it('keeps valid digit strings, strips junk, dedups', () => {
    expect(parseBarcodes('["5741000109151", "12345", "abc", "5741000109151"]')).toEqual([
      '5741000109151',
    ]);
  });
  it('handles code fences and numbers', () => {
    expect(parseBarcodes('```json\n[5741000109151]\n```')).toEqual(['5741000109151']);
  });
  it('normalizes spaced/dashed digits', () => {
    expect(parseBarcodes('["574 1000 109151"]')).toEqual(['5741000109151']);
  });
  it('returns [] on garbage', () => {
    expect(parseBarcodes('not json')).toEqual([]);
  });
});

describe('BarcodeFinderService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('is disabled without a key (no call)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new BarcodeFinderService(cfg({}));
    expect(svc.enabled).toBe(false);
    expect(await svc.find([IMG])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads barcode digits from the vision response', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(geminiOk('["5741000109151", "5449000000996"]')) as unknown as typeof fetch;
    const out = await new BarcodeFinderService(cfg({ GEMINI_API_KEY: 'k' })).find([IMG]);
    expect(out).toEqual(['5741000109151', '5449000000996']);
  });

  it('returns [] on a vision error', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }) as unknown as typeof fetch;
    expect(await new BarcodeFinderService(cfg({ GEMINI_API_KEY: 'k' })).find([IMG])).toEqual([]);
  });
});
