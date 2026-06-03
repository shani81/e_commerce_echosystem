'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge } from '@aicos/ui';
import {
  formatCents,
  getStore,
  listProducts,
  type ProductCard,
  type StoreInfo,
} from '@/lib/storefront-api';

export default function ShopPage() {
  const [store, setStore] = React.useState<StoreInfo | null>(null);
  const [term, setTerm] = React.useState('');
  const [submitted, setSubmitted] = React.useState('');
  const [products, setProducts] = React.useState<ProductCard[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    getStore()
      .then(setStore)
      .catch(() => setStore(null));
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    listProducts(submitted, 1, 24)
      .then((r) => {
        if (!active) return;
        setProducts(r.items);
        setTotal(r.total);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [submitted]);

  const currency = store?.currency ?? 'USD';

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              A
            </span>
            <span className="text-lg font-semibold tracking-tight text-neutral-900">
              {store?.name ?? 'Store'}
            </span>
          </Link>
          <form
            className="ml-auto w-full sm:w-80"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(term.trim());
            }}
          >
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search products…"
              className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
            />
          </form>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-xl font-semibold text-neutral-900">
            {submitted ? `Results for “${submitted}”` : 'All products'}
          </h1>
          {!loading && !error ? (
            <span className="text-sm text-neutral-500">
              {total} {total === 1 ? 'product' : 'products'}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-44 animate-pulse rounded-xl border border-neutral-200 bg-white" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
            {error}
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-4 py-16 text-center text-sm text-neutral-400">
            No products found{submitted ? ` for “${submitted}”` : ''}.
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.slug}`}
                  className="group flex h-full flex-col rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex aspect-square items-center justify-center rounded-lg bg-neutral-100 text-neutral-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.25} className="h-10 w-10">
                      <path d="M3 9l9-6 9 6v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  {p.brandName ? (
                    <Badge variant="neutral" size="sm" className="mb-1 self-start">
                      {p.brandName}
                    </Badge>
                  ) : null}
                  <span className="line-clamp-2 text-sm font-medium text-neutral-900 group-hover:text-brand-700">
                    {p.title}
                  </span>
                  <span className="mt-auto pt-2 text-sm font-semibold text-neutral-900">
                    {formatCents(p.priceMinCents, currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
