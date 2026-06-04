/**
 * Pure CSV/WooCommerce parsing helpers for the product importer, extracted from
 * ImportService so the parsing + field-mapping is unit-tested without a DB.
 */

export interface ImportRow {
  title: string;
  sku?: string;
  priceCents: number;
  description?: string;
  brand?: string;
}

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes (""), CRLF. */
export function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** "12.99" / "$1,299.00" → integer cents; non-numeric → 0. */
export function dollarsToCents(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** URL-safe slug from a title (lowercase, hyphenated, ≤80 chars). */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}

/** Parse a CSV/WooCommerce export into import rows (headers matched loosely). */
export function csvToImportRows(csv: string): ImportRow[] {
  const table = parseDelimited(csv);
  const headerRow = table[0];
  if (!headerRow || table.length < 2) return [];
  const header = headerRow.map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]): number => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };
  const iTitle = idx('name', 'title', 'product name');
  const iSku = idx('sku');
  const iPrice = idx('regular price', 'price', 'sale price');
  const iDesc = idx('description', 'short description');
  const iBrand = idx('brand', 'brands');

  const rows: ImportRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    if (!cells) continue;
    const title = (iTitle >= 0 ? cells[iTitle] : '')?.trim();
    if (!title) continue;
    rows.push({
      title,
      sku: iSku >= 0 ? cells[iSku]?.trim() || undefined : undefined,
      priceCents: dollarsToCents(iPrice >= 0 ? cells[iPrice] : ''),
      description: iDesc >= 0 ? cells[iDesc]?.trim() || undefined : undefined,
      brand: iBrand >= 0 ? cells[iBrand]?.trim() || undefined : undefined,
    });
  }
  return rows;
}
