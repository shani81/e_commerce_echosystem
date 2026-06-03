'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, Button } from '@aicos/ui';
import { formatCents, getProduct, type ProductDetail } from '@/lib/storefront-api';

export default function ProductPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;
  const [product, setProduct] = React.useState<ProductDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    setError(null);
    getProduct(slug)
      .then((p) => active && setProduct(p))
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  const minPrice = product?.variants.length
    ? Math.min(...product.variants.map((v) => v.priceCents))
    : null;

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-6 py-4">
          <Link href="/shop" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            ← Back to shop
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
                    {product.variants.map((v) => (
                      <li key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-neutral-700">
                          {v.title}
                          {v.sku ? <span className="ml-2 text-xs text-neutral-400">{v.sku}</span> : null}
                        </span>
                        <span className="font-medium text-neutral-900">{formatCents(v.priceCents)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-8">
                <Button size="lg" disabled>
                  Add to cart (coming in M1.3)
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
