'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button } from '@aicos/ui';
import { addToCart, formatCents, getProduct, type ProductDetail } from '@/lib/storefront-api';

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [product, setProduct] = React.useState<ProductDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedVariant, setSelectedVariant] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [added, setAdded] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    setError(null);
    getProduct(slug)
      .then((p) => {
        if (!active) return;
        setProduct(p);
        setSelectedVariant(p.variants[0]?.id ?? null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  const minPrice = product?.variants.length
    ? Math.min(...product.variants.map((v) => v.priceCents))
    : null;

  async function onAdd() {
    if (!selectedVariant) return;
    setAdding(true);
    setAddError(null);
    setAdded(false);
    try {
      await addToCart(selectedVariant, 1);
      setAdded(true);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Could not add to cart');
    } finally {
      setAdding(false);
    }
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/shop" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            ← Back to shop
          </Link>
          <Link href="/cart" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Cart
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-8">
        {loading ? (
          <div className="h-72 animate-pulse rounded-xl border border-neutral-200 bg-white" />
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700">
            {error}
          </div>
        ) : !product ? null : (
          <div className="grid gap-8 md:grid-cols-2">
            <div className="flex aspect-square items-center justify-center rounded-2xl bg-neutral-100 text-neutral-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="h-20 w-20">
                <path d="M3 9l9-6 9 6v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V9z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              {product.brand ? (
                <Badge variant="neutral" size="sm" className="mb-2">
                  {product.brand.name}
                </Badge>
              ) : null}
              <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
                {product.title}
              </h1>
              <p className="mt-2 text-xl font-semibold text-neutral-900">{formatCents(minPrice)}</p>
              {product.description ? (
                <p className="mt-4 text-sm leading-relaxed text-neutral-600">{product.description}</p>
              ) : null}

              {product.variants.length > 0 ? (
                <div className="mt-6">
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Options
                  </h2>
                  <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 bg-white">
                    {product.variants.map((v) => {
                      const selected = v.id === selectedVariant;
                      return (
                        <li key={v.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedVariant(v.id);
                              setAdded(false);
                            }}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors ${
                              selected ? 'bg-brand-50' : 'hover:bg-neutral-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 text-neutral-700">
                              <span
                                aria-hidden
                                className={`inline-block h-3.5 w-3.5 rounded-full border ${
                                  selected ? 'border-brand-600 bg-brand-600' : 'border-neutral-300'
                                }`}
                              />
                              {v.title}
                              {v.sku ? <span className="text-xs text-neutral-400">{v.sku}</span> : null}
                            </span>
                            <span className="font-medium text-neutral-900">
                              {formatCents(v.priceCents)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {addError ? (
                <p role="alert" className="mt-4 text-sm font-medium text-red-700">
                  {addError}
                </p>
              ) : null}

              <div className="mt-8 flex items-center gap-3">
                <Button size="lg" onClick={onAdd} isLoading={adding} disabled={!selectedVariant}>
                  Add to cart
                </Button>
                {added ? (
                  <Link
                    href="/cart"
                    className="text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    Added ✓ — View cart
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
