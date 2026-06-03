'use client';

import * as React from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@aicos/ui';
import { Field, Input } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';
import { CatalogTabs } from '../_components/catalog-tabs';
import type { Brand } from '../_components/types';

export default function BrandsPage() {
  const [items, setItems] = React.useState<Brand[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<Paginated<Brand>>('/brands?page=1&pageSize=100')
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Failed to load brands.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setOk(false);

    const trimmed = name.trim();
    if (!trimmed) {
      setFormError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      await apiPost<Brand>('/brands', { name: trimmed });
      setName('');
      setOk(true);
      window.setTimeout(() => setOk(false), 2500);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create brand.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Brands" description="Manage the brands available to products." />

      <CatalogTabs />

      <Card variant="outline" padding="lg">
        <CardHeader className="mb-4">
          <CardTitle>New brand</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" noValidate>
            <Field label="Name" htmlFor="brand-name" required className="min-w-[14rem] flex-1">
              <Input
                id="brand-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Aurora Audio"
              />
            </Field>
            <Button type="submit" isLoading={saving}>
              Add brand
            </Button>
            {formError ? (
              <p role="alert" className="w-full text-sm font-medium text-danger">
                {formError}
              </p>
            ) : null}
            {ok ? <p className="w-full text-sm font-medium text-green-700">Brand created.</p> : null}
          </form>
        </CardContent>
      </Card>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}

      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={1}>Loading brands…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={1}>No brands yet.</EmptyRow>
          ) : (
            items.map((b) => (
              <Tr key={b.id}>
                <Td className="font-medium text-neutral-900">{b.name}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
