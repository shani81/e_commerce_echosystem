import { isProductCode, lookupBarcodeProduct } from './barcode-lookup.util';

describe('barcode-lookup util', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('isProductCode validates numeric 6–14 digit codes', () => {
    expect(isProductCode('5449000000996')).toBe(true);
    expect(isProductCode('12345')).toBe(false); // too short
    expect(isProductCode('ABC')).toBe(false);
  });

  it('maps an Open Food Facts hit to a product', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 1,
        product: { product_name: 'Cola', brands: 'Coca-Cola, Coke', categories: 'en:beverages, en:sodas' },
      }),
    }) as unknown as typeof fetch;

    expect(await lookupBarcodeProduct('5449000000996')).toEqual({
      title: 'Cola',
      brand: 'Coca-Cola',
      category: 'sodas',
    });
  });

  it('skips a non-numeric code without calling the network', async () => {
    const f = jest.fn();
    global.fetch = f as unknown as typeof fetch;
    expect(await lookupBarcodeProduct('ABC')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('returns null when the product is not found', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 0 }) }) as unknown as typeof fetch;
    expect(await lookupBarcodeProduct('0000000000000')).toBeNull();
  });
});
