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
  images: { id: string; altText: string | null; isPrimary: boolean; url: string | null }[];
}

// --- Cart -------------------------------------------------------------------
export interface CartLine {
  variantId: string;
  productSlug: string;
  productTitle: string;
  variantTitle: string;
  sku: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}
export interface CartView {
  token: string;
  currency: string;
  items: CartLine[];
  subtotalCents: number;
  itemCount: number;
}
export interface CheckoutResponse {
  orderId: string;
  orderNumber: string;
  sessionId: string;
  url: string | null;
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body?.message) return Array.isArray(body.message) ? body.message.join(', ') : body.message;
  } catch {
    /* non-JSON */
  }
  return `Request failed (${res.status})`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<T>;
}

async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(await errorMessage(res));
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

// --- Cart token (kept in localStorage; the cart is anonymous + token-addressed)
const CART_TOKEN_KEY = 'aicos.cart.token';
export function getCartToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(CART_TOKEN_KEY);
}
export function setCartToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(CART_TOKEN_KEY, token);
  else window.localStorage.removeItem(CART_TOKEN_KEY);
}

/** Read the current cart, or null when there is no (live) cart. */
export async function getCart(): Promise<CartView | null> {
  const token = getCartToken();
  if (!token) return null;
  const res = await fetch(`${BASE}/cart/${token}`, { cache: 'no-store' });
  if (res.status === 404) {
    setCartToken(null);
    return null;
  }
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json() as Promise<CartView>;
}

/** Add a variant to the cart, creating one (and persisting its token) if needed. */
export async function addToCart(variantId: string, quantity = 1): Promise<CartView> {
  let token = getCartToken();
  if (!token) {
    const created = await send<CartView>('POST', '/cart');
    token = created.token;
    setCartToken(token);
  }
  try {
    return await send<CartView>('POST', `/cart/${token}/items`, { variantId, quantity });
  } catch (err) {
    // Token referenced a stale/checked-out cart — start a fresh one and retry once.
    if (err instanceof Error && /not found|checked out/i.test(err.message)) {
      const created = await send<CartView>('POST', '/cart');
      setCartToken(created.token);
      return send<CartView>('POST', `/cart/${created.token}/items`, { variantId, quantity });
    }
    throw err;
  }
}

export async function setCartQuantity(variantId: string, quantity: number): Promise<CartView> {
  const token = getCartToken();
  if (!token) throw new Error('No cart');
  return send<CartView>('PATCH', `/cart/${token}/items/${variantId}`, { quantity });
}

export const removeFromCart = (variantId: string) => setCartQuantity(variantId, 0);

/** Convert the cart to an order and return the Stripe Checkout Session. */
export async function checkout(email?: string): Promise<CheckoutResponse> {
  const token = getCartToken();
  if (!token) throw new Error('Your cart is empty');
  return send<CheckoutResponse>('POST', '/checkout', { token, ...(email ? { email } : {}) });
}

// --- Customer portal (order lookup, returns, GDPR) --------------------------
export interface OrderLine {
  orderItemId: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}
export interface OrderShipment {
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shippedAt: string | null;
}
export interface OrderLookupResult {
  number: string;
  status: string;
  financialStatus: string;
  fulfillmentStatus: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  placedAt: string | null;
  createdAt: string;
  items: OrderLine[];
  shipments: OrderShipment[];
  returns: { id: string; status: string; createdAt: string }[];
}

export const lookupOrder = (email: string, orderNumber: string) =>
  send<OrderLookupResult>('POST', '/orders/lookup', { email, orderNumber });

export const requestReturn = (
  email: string,
  orderNumber: string,
  items: { orderItemId: string; quantity: number }[],
  reason?: string,
) =>
  send<{ id: string; status: string; createdAt: string }>('POST', '/returns', {
    email,
    orderNumber,
    items,
    ...(reason ? { reason } : {}),
  });

export const requestDataAction = (email: string, type: 'EXPORT' | 'ERASURE') =>
  send<{ id: string; type: string; status: string; dueAt: string }>('POST', '/gdpr/request', {
    email,
    type,
  });
