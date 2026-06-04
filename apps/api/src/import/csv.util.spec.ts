import { csvToImportRows, dollarsToCents, parseDelimited, slugify } from './csv.util';

describe('parseDelimited', () => {
  it('parses a simple grid', () => {
    expect(parseDelimited('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseDelimited('name,desc\n"Tee","soft, cotton"')).toEqual([
      ['name', 'desc'],
      ['Tee', 'soft, cotton'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseDelimited('q\n"a ""b"" c"')).toEqual([['q'], ['a "b" c']]);
  });

  it('handles CRLF and drops blank rows', () => {
    expect(parseDelimited('a\r\n1\r\n\r\n2')).toEqual([['a'], ['1'], ['2']]);
  });
});

describe('dollarsToCents', () => {
  it('converts decimal dollars', () => {
    expect(dollarsToCents('12.99')).toBe(1299);
  });
  it('strips currency formatting', () => {
    expect(dollarsToCents('$1,299.00')).toBe(129900);
  });
  it('is 0 for empty/garbage', () => {
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents(undefined)).toBe(0);
    expect(dollarsToCents('n/a')).toBe(0);
  });
});

describe('slugify', () => {
  it('lowercases + hyphenates', () => {
    expect(slugify('Classic Tee!')).toBe('classic-tee');
  });
  it('trims leading/trailing separators', () => {
    expect(slugify('  --Hi--  ')).toBe('hi');
  });
  it('falls back to "item" when empty', () => {
    expect(slugify('!!!')).toBe('item');
  });
});

describe('csvToImportRows', () => {
  it('maps a WooCommerce-style export', () => {
    const csv = 'Name,SKU,Regular price,Description,Brand\nClassic Tee,TEE-001,19.99,Soft cotton,Acme';
    expect(csvToImportRows(csv)).toEqual([
      { title: 'Classic Tee', sku: 'TEE-001', priceCents: 1999, description: 'Soft cotton', brand: 'Acme' },
    ]);
  });

  it('skips rows without a title and tolerates missing columns', () => {
    const csv = 'title,price\nWidget,5.00\n,9.99';
    expect(csvToImportRows(csv)).toEqual([
      { title: 'Widget', sku: undefined, priceCents: 500, description: undefined, brand: undefined },
    ]);
  });

  it('returns [] for a header-only file', () => {
    expect(csvToImportRows('Name,SKU')).toEqual([]);
  });
});
