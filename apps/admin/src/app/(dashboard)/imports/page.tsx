'use client';

import * as React from 'react';
import { Button, Card } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { apiPost, ApiError } from '@/lib/api';

interface ImportSummary {
  created: number;
  skipped: number;
  errors: string[];
}

const SAMPLE_CSV = `Name,SKU,Regular price,Description,Brand
Classic Tee,TEE-001,19.99,Soft cotton tee,Acme
Travel Mug,MUG-002,12.50,Keeps drinks hot,Acme`;

export default function ImportsPage() {
  const [mode, setMode] = React.useState<'csv' | 'json'>('csv');
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let body: unknown;
      if (mode === 'csv') {
        body = { format: 'csv', csv: text };
      } else {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) throw new Error('JSON must be an array of products');
        body = { format: 'json', products: parsed };
      }
      setResult(await apiPost<ImportSummary>('/imports/products', body));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Import failed',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Import products"
        description="Bulk-create products from a CSV / WooCommerce export or a JSON array. Imported products land as DRAFT for review."
      />

      <Card variant="outline" padding="lg">
        <div className="mb-3 flex gap-2 text-sm">
          {(['csv', 'json'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 font-medium ${
                mode === m ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-neutral-700'
              }`}
            >
              {m === 'csv' ? 'CSV / WooCommerce' : 'JSON'}
            </button>
          ))}
          {mode === 'csv' ? (
            <button
              type="button"
              onClick={() => setText(SAMPLE_CSV)}
              className="ml-auto text-xs text-brand-700 hover:underline"
            >
              Load sample
            </button>
          ) : null}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={
            mode === 'csv'
              ? 'Paste CSV (headers: Name, SKU, Regular price, Description, Brand)…'
              : '[ { "title": "Classic Tee", "sku": "TEE-001", "priceCents": 1999, "brand": "Acme" } ]'
          }
          className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 font-mono text-xs text-neutral-900 focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
        />

        <div className="mt-3">
          <Button isLoading={busy} disabled={!text.trim()} onClick={run}>
            Import products
          </Button>
        </div>

        {error ? <p className="mt-3 text-sm font-medium text-red-700">{error}</p> : null}

        {result ? (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <p className="font-medium text-neutral-900">
              Imported {result.created} · skipped {result.skipped} · {result.errors.length} error
              {result.errors.length === 1 ? '' : 's'}
            </p>
            {result.errors.length > 0 ? (
              <ul className="mt-2 list-inside list-disc text-red-700">
                {result.errors.slice(0, 10).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-2 text-xs text-neutral-500">
              New products are DRAFT — review and publish them in Catalog.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
