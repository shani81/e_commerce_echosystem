// Public storefront API client (no auth). Talks to the API's /storefront
// endpoints for a single configured store. Multi-store routing (by domain) is a
// later-phase concern; for now the store is fixed via NEXT_PUBLIC_STORE_SLUG.
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const STORE_SLUG = process.env.NEXT_PUBLIC_STORE_SLUG ?? 'demo';
const BASE = `${API}/api/v1/storefront/${STORE_SLUG}`;

export interface StoreInfo {
  slug: string;
  name: string;
  currency: string;
}
export interface ProductCard {
  id: string;
  title: string;
  slug: string;
  priceMinCents: number | null;
  brandName: string | null;
}
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export interface VariantLite {
  id: string;
  title: string;
  sku: string | null;
  priceCents: number;
}
export interface ProductDetail {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  brand: { name: string } | null;
  variants: VariantLite[];
  images: { id: string; altText: string | null }[];
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body?.message) {
        message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      }
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const getStore = () => getJson<StoreInfo>('');
export const listProducts = (q: string, page = 1, pageSize = 24) =>
  getJson<Paged<ProductCard>>(
    `/products?q=${encodeURIComponent(q)}&page=${page}&pageSize=${pageSize}`,
  );
export const getProduct = (slug: string) =>
  getJson<ProductDetail>(`/products/${encodeURIComponent(slug)}`);

export function formatCents(cents: number | null, currency = 'USD'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
