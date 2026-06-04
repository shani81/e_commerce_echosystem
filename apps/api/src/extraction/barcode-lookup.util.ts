// Resolve a GTIN/UPC/EAN to a product via Open Food Facts → Open Products Facts
// (free, keyless). Mirrors the worker's BarcodeLookupService for the manual
// "add by barcode" path in the review UI. Pure function — no DI.

export interface BarcodeProduct {
  title: string;
  brand: string | null;
  category: string | null;
}

const HOSTS = ['https://world.openfoodfacts.org', 'https://world.openproductsfacts.org'];
const TIMEOUT_MS = 5000;

/** True for a plausible product code (numeric, 6–14 digits). */
export function isProductCode(barcode: string): boolean {
  return /^\d{6,14}$/.test(barcode.trim());
}

export async function lookupBarcodeProduct(barcode: string): Promise<BarcodeProduct | null> {
  const code = barcode.trim();
  if (!isProductCode(code)) return null;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/api/v2/product/${code}.json?fields=product_name,brands,categories`, {
        headers: { 'User-Agent': 'AICOS-Extraction/1.0 (+https://aicos.local)' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        status?: number;
        product?: { product_name?: string; brands?: string; categories?: string };
      };
      const title = json.product?.product_name?.trim();
      if (json.status === 1 && title) {
        return {
          title,
          brand: firstToken(json.product?.brands),
          category: lastCategory(json.product?.categories),
        };
      }
    } catch {
      // try the next host
    }
  }
  return null;
}

function firstToken(s?: string): string | null {
  const t = s?.split(',')[0]?.trim();
  return t || null;
}

function lastCategory(s?: string): string | null {
  const parts = s?.split(',').map((c) => c.trim()).filter(Boolean) ?? [];
  const last = parts[parts.length - 1];
  return last ? last.replace(/^[a-z]{2}:/, '') : null;
}
