'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@aicos/ui';
import {
  checkout,
  formatCents,
  getCart,
  removeFromCart,
  setCartQuantity,
  type CartView,
} from '@/lib/storefront-api';

export default function CartPage() {
  const [cart, setCart] = React.useState<CartView | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      setCart(await getCart());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cart');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  async function changeQty(variantId: string, quantity: number) {
    setError(null);
    try {
      setCart(await setCartQuantity(variantId, quantity));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update cart');
    }
  }
  async function remove(variantId: string) {
    setError(null);
    try {
      setCart(await removeFromCart(variantId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove item');
    }
  }

  async function onCheckout() {
    setBusy(true);
    setError(null);
    try {
      const res = await checkout(email.trim() || undefined);
      if (res.url) {
        window.location.href = res.url; // → Stripe Checkout
      } else {
        setError('Checkout session has no redirect URL.');
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setBusy(false);
    }
  }

  const currency = cart?.currency ?? 'USD';
  const isEmpty = !cart || cart.items.length === 0;

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/shop" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            ← Continue shopping
          </Link>
          <span className="text-lg font-semibold tracking-tight text-neutral-900">Your cart</span>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 py-8">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="h-40 animate-pulse rounded-xl border border-neutral-200 bg-white" />
        ) : isEmpty ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-16 text-center">
            <p className="text-sm text-neutral-500">Your cart is empty.</p>
            <Link href="/shop" className="mt-3 inline-block text-sm font-medium text-brand-700 hover:text-brand-800">
              Browse products →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
              {cart.items.map((it) => (
                <li key={it.variantId} className="flex items-center gap-4 px-4 py-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-6 w-6">
                      <path d="M3 9l9-6 9 6v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${it.productSlug}`}
                      className="line-clamp-1 text-sm font-medium text-neutral-900 hover:text-brand-700"
                    >
                      {it.productTitle}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {it.variantTitle}
                      {it.sku ? ` · ${it.sku}` : ''} · {formatCents(it.unitPriceCents, currency)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={() => changeQty(it.variantId, Math.max(0, it.quantity - 1))}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums">{it.quantity}</span>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={() => changeQty(it.variantId, it.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                    >
                      +
                    </button>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold tabular-nums text-neutral-900">
                    {formatCents(it.lineTotalCents, currency)}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(it.variantId)}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
              <span className="text-sm text-neutral-500">Subtotal</span>
              <span className="text-lg font-semibold text-neutral-900">
                {formatCents(cart.subtotalCents, currency)}
              </span>
            </div>

            <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
              <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
                Email <span className="font-normal text-neutral-400">(optional — for your receipt)</span>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
              />
              <Button fullWidth size="lg" isLoading={busy} onClick={onCheckout}>
                Checkout · {formatCents(cart.subtotalCents, currency)}
              </Button>
              <p className="text-center text-xs text-neutral-400">
                You’ll be redirected to Stripe to complete payment securely.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
