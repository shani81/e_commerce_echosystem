'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button, Badge } from '@aicos/ui';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { apiGet, apiPost, apiDelete, ApiError, type Paginated } from '@/lib/api';
import { CatalogTabs } from './_components/catalog-tabs';
import {
  PRODUCT_STATUSES,
  STATUS_BADGE,
  STATUS_LABEL,
  formatCents,
  minVariantPriceCents,
  type Product,
  type ProductStatus,
} from './_components/types';

const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZES = [10, 25, 50];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function ProductsListPage() {
  const [items, setItems] = React.useState<Product[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Query controls.
  const [q, setQ] = React.useState('');
  const [queryInput, setQueryInput] = React.useState('');
  const [status, setStatus] = React.useState<'' | ProductStatus>('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(DEFAULT_PAGE_SIZE);

  // Per-row action state.
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [rowError, setRowError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (q) params.set('q', q);
    if (status) params.set('status', status);

    apiGet<Paginated<Product>>(`/products?${params.toString()}`)
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'Failed to load products.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, status, page, pageSize, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function onSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQ(queryInput.trim());
  }

  async function onPublish(product: Product) {
    setBusyId(product.id);
    setRowError(null);
    try {
      await apiPost(`/products/${product.id}/publish`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not publish product.');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(product: Product) {
    if (!window.confirm(`Delete “${product.title}”? This cannot be undone.`)) return;
    setBusyId(product.id);
    setRowError(null);
    try {
      await apiDelete(`/products/${product.id}`);
      // If we just emptied the last page, step back one.
      if (items.length === 1 && page > 1) setPage((p) => p - 1);
      else setReloadKey((k) => k + 1);
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not delete product.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Catalog"
        description="Manage products, variants, categories and brands."
        action={
          <Link href="/catalog/new">
            <Button>New product</Button>
          </Link>
        }
      />

      <CatalogTabs />

      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-3">
        <Field label="Search" htmlFor="q" className="min-w-[16rem] flex-1">
          <Input
            id="q"
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            placeholder="Search by title…"
          />
        </Field>
        <Field label="Status" htmlFor="status" className="w-48">
          <Select
            id="status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value as '' | ProductStatus);
            }}
          >
            <option value="">All statuses</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {rowError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {rowError}
        </p>
      ) : null}

      <Table>
        <THead>
          <Tr>
            <Th>Title</Th>
            <Th>Status</Th>
            <Th className="text-right">Price</Th>
            <Th>Updated</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={5}>Loading products…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={5}>No products found.</EmptyRow>
          ) : (
            items.map((product) => {
              const price = minVariantPriceCents(product.variants);
              const busy = busyId === product.id;
              return (
                <Tr key={product.id}>
                  <Td>
                    <Link
                      href={`/catalog/${product.id}`}
                      className="font-medium text-neutral-900 hover:text-brand-700"
                    >
                      {product.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge variant={STATUS_BADGE[product.status]}>
                      {STATUS_LABEL[product.status]}
                    </Badge>
                  </Td>
                  <Td className="text-right tabular-nums">
                    {price === null ? '—' : formatCents(price)}
                  </Td>
                  <Td className="whitespace-nowrap text-neutral-500">
                    {formatDate(product.updatedAt)}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/catalog/${product.id}`}>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </Link>
                      {product.status !== 'ACTIVE' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          isLoading={busy}
                          onClick={() => onPublish(product)}
                        >
                          Publish
                        </Button>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-red-50"
                        disabled={busy}
                        onClick={() => onDelete(product)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Td>
                </Tr>
              );
            })
          )}
        </TBody>
      </Table>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-600">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            className="h-9 w-20"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span>
            {total === 0
              ? '0 results'
              : `Page ${page} of ${totalPages} · ${total} total`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
