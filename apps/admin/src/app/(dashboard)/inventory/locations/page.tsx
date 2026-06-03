'use client';

import * as React from 'react';
import { Button, Badge, Card } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Field, Input } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, apiPost, ApiError } from '@/lib/api';
import { InventoryTabs } from '../_components/inventory-tabs';

interface Location {
  id: string;
  name: string;
  isDefault: boolean;
}

export default function LocationsPage() {
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // New-location form state.
  const [name, setName] = React.useState('');
  const [isDefault, setIsDefault] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Location[]>('/locations');
      setLocations(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load locations.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function onCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(null);
    if (!name.trim()) {
      setFormError('Name is required.');
      return;
    }
    setCreating(true);
    try {
      await apiPost<Location>('/locations', { name: name.trim(), isDefault });
      setName('');
      setIsDefault(false);
      setSuccess('Location created.');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create location.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock locations across the business."
      />
      <InventoryTabs />

      <Card variant="outline" padding="md">
        <h3 className="text-sm font-semibold text-neutral-900">New location</h3>
        <form onSubmit={onCreate} className="mt-4 flex flex-wrap items-end gap-4" noValidate>
          <Field label="Name" htmlFor="loc-name" required className="min-w-[16rem] flex-1">
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main warehouse"
              required
            />
          </Field>
          <label className="flex h-10 items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-brand-600 focus-visible:ring-brand-500"
            />
            Default location
          </label>
          <Button type="submit" isLoading={creating}>
            Create location
          </Button>
        </form>
        {formError ? (
          <p role="alert" className="mt-3 text-sm font-medium text-danger">
            {formError}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 text-sm font-medium text-success">{success}</p>
        ) : null}
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
            <Th>Default</Th>
            <Th className="font-mono">ID</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={3}>Loading locations…</EmptyRow>
          ) : locations.length === 0 ? (
            <EmptyRow colSpan={3}>No locations yet. Create one above.</EmptyRow>
          ) : (
            locations.map((loc) => (
              <Tr key={loc.id}>
                <Td className="font-medium text-neutral-900">{loc.name}</Td>
                <Td>
                  {loc.isDefault ? (
                    <Badge variant="brand">Default</Badge>
                  ) : (
                    <span className="text-neutral-400">—</span>
                  )}
                </Td>
                <Td className="font-mono text-xs text-neutral-400">{loc.id}</Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>
    </div>
  );
}
