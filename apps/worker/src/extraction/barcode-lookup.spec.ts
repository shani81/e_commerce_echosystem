import type { ConfigService } from '@nestjs/config';
import { BarcodeLookupService } from './barcode-lookup.service';

const cfg = (env: Record<string, string | undefined>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

const offHit = (product: Record<string, unknown>) => ({
  ok: true,
  json: async () => ({ status: 1, product }),
});
const offMiss = { ok: true, json: async () => ({ status: 0 }) };

describe('BarcodeLookupService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('maps an Open Food Facts hit to a product', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        offHit({ product_name: 'Coca-Cola 330ml', brands: 'Coca-Cola, Coke', categories: 'en:beverages, en:sodas' }),
      ) as unknown as typeof fetch;

    const p = await new BarcodeLookupService(cfg({})).lookup('5449000000996');

    expect(p?.title).toBe('Coca-Cola 330ml');
    expect(p?.brandGuess).toBe('Coca-Cola'); // first brand
    expect(p?.categoryGuess).toBe('sodas'); // most-specific, lang prefix stripped
    expect(p?.overallConfidence).toBeGreaterThan(0.9);
    expect(p?.priceCents).toBeNull();
    expect(p?.barcode).toBe('5449000000996'); // GTIN carried through to the product
  });

  it('returns null when the product is not found (status 0)', async () => {
    global.fetch = jest.fn().mockResolvedValue(offMiss) as unknown as typeof fetch;
    expect(await new BarcodeLookupService(cfg({})).lookup('0000000000000')).toBeNull();
  });

  it('skips non-numeric / too-short codes without calling the network', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await new BarcodeLookupService(cfg({})).lookup('ABC')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is disabled via BARCODE_LOOKUP_ENABLED=false', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const svc = new BarcodeLookupService(cfg({ BARCODE_LOOKUP_ENABLED: 'false' }));
    expect(svc.on).toBe(false);
    expect(await svc.lookup('5449000000996')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the second host when the first misses', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(offMiss)
      .mockResolvedValueOnce(offHit({ product_name: 'Widget' }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const p = await new BarcodeLookupService(cfg({})).lookup('1234567890123');
    expect(p?.title).toBe('Widget');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
