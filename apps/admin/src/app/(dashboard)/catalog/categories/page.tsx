'use client';

import * as React from 'react';
import { Button, Card, CardHeader, CardTitle, CardContent } from '@aicos/ui';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';
import { CatalogTabs } from '../_components/catalog-tabs';
import type { Category } from '../_components/types';

export default function CategoriesPage() {
  const [items, setItems] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState('');
  const [parentId, setParentId] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiGet<Paginated<Category>>('/categories?page=1&pageSize=100')
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof ApiError ? err.message : 'Failed to load categories.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const nameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const c of items) map.set(c.id, c.name);
    return map;
  }, [items]);

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
      await apiPost<Category>('/categories', {
        name: trimmed,
        parentId: parentId || undefined,
      });
      setName('');
      setParentId('');
      setOk(true);
      window.setTimeout(() => setOk(false), 2500);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Categories" description="Organize products into a category tree." />

      <CatalogTabs />

      <Card variant="outline" padding="lg">
        <CardHeader className="mb-4">
          <CardTitle>New category</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3" noValidate>
            <Field label="Name" htmlFor="cat-name" required className="min-w-[14rem] flex-1">
              <Input
                id="cat-name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Beverages"
              />
            </Field>
            <Field label="Parent" htmlFor="cat-parent" className="w-56">
              <Select id="cat-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">No parent (top level)</option>
                {items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" isLoading={saving}>
              Add category
            </Button>
            {formError ? (
              <p role="alert" className="w-full text-sm font-medium text-danger">
                {formError}
              </p>
            ) : null}
            {ok ? (
              <p className="w-full text-sm font-medium text-green-700">Category created.</p>
            ) : null}
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
            <Th>Parent</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={2}>Loading categories…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={2}>No categories yet.</EmptyRow>
          ) : (
            items.map((c) => (
              <Tr key={c.id}>
                <Td className="font-medium text-neutral-900">{c.name}</Td>
                <Td className="text-neutral-500">
                  {c.parentId ? nameById.get(c.parentId) ?? '—' : '—'}
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
