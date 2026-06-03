// Id / slug / SKU helpers. Slugs key tenant-scoped natural unique constraints
// (e.g. Product.slug, Store.slug, Category.slug in the Prisma schema), so the
// normalization here must be deterministic and URL-safe.

/** Unicode range of combining diacritical marks, stripped after NFKD decompose. */
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Normalize arbitrary text into a URL-safe slug:
 *   - lowercased, accents stripped,
 *   - non-alphanumeric runs collapsed to single hyphens,
 *   - leading/trailing hyphens trimmed.
 * @example slugify("Cafe Creme 500ml!") // "cafe-creme-500ml"
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build a slug that is unique within a set of taken slugs by appending a numeric
 * suffix (`-2`, `-3`, ...). Pass the slugs already in use for the tenant.
 */
export function uniqueSlug(input: string, taken: Iterable<string> = []): string {
  const base = slugify(input) || 'item';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/**
 * Derive a SKU from a product title (and optional variant/option parts).
 * Uppercased, alphanumeric segments joined by hyphens, truncated.
 * @example skuFromTitle("Cold Brew", ["500ml", "Black"]) // "COLD-BREW-500ML-BLACK"
 */
export function skuFromTitle(title: string, parts: string[] = [], maxLength = 48): string {
  const normalize = (s: string): string =>
    s
      .normalize('NFKD')
      .replace(COMBINING_MARKS, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const segments = [title, ...parts].map(normalize).filter(Boolean);
  return segments.join('-').slice(0, maxLength).replace(/-+$/g, '');
}

/** Default alphabet for short, unambiguous random codes (no 0/O/1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a random uppercase code (e.g. for gift cards / discount codes).
 * Not cryptographically strong enough for secrets — use a CSPRNG for those.
 */
export function randomCode(length = 12): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
