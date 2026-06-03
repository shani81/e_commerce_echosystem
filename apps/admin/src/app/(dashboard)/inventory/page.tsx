'use client';

import * as React from 'react';
import { Button, Badge, Card } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Field, Input, Select } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';
import { InventoryTabs } from './_components/inventory-tabs';

interface InventoryItem {
  id: string;
  variantId: string;
  locationId: string;
  onHand: number;
  reserved: number;
  available: number;
  reorderPoint: number;
  reorderQty: number;
}

interface Location {
  id: string;
  name: string;
}

// StockMovementType values offered for manual adjustments (subset of the
// Prisma enum — SALE/RESERVATION/RELEASE/EXTRACTION_SEED are system-driven).
const MOVEMENT_TYPES = ['ADJUSTMENT', 'RECEIVE', 'RETURN', 'TRANSFER'] as const;
type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Short, copy-safe display form for an opaque id. */
function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

interface AdjustTarget {
  variantId: string;
  locationId: string;
}

export default function InventoryItemsPage() {
  const [list, setList] = React.useState<Paginated<InventoryItem> | null>(null);
  const [locations, setLocations] = React.useState<Location[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);

  const [adjustTarget, setAdjustTarget] = React.useState<AdjustTarget | null>(null);
  const [showNewItem, setShowNewItem] = React.useState(false);

  const locationName = React.useCallback(
    (id: string) => locations.find((l) => l.id === id)?.name ?? shortId(id),
    [locations],
  );

  const loadList = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<Paginated<InventoryItem>>(
        `/inventory?page=${page}&pageSize=${pageSize}`,
      );
      setList(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load inventory.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  const loadLocations = React.useCallback(async () => {
    try {
      const data = await apiGet<Location[]>('/locations');
      setLocations(Array.isArray(data) ? data : []);
    } catch {
      setLocations([]);
    }
  }, []);

  React.useEffect(() => {
    loadList();
  }, [loadList]);

  React.useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const items = list?.items ?? [];
  const total = list?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function refetch() {
    loadList();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Inventory"
        description="Stock levels per variant and location."
        action={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewItem(false);
                setAdjustTarget({ variantId: '', locationId: '' });
              }}
            >
              Adjust stock
            </Button>
            <Button
              onClick={() => {
                setAdjustTarget(null);
                setShowNewItem((v) => !v);
              }}
            >
              New inventory item
            </Button>
          </>
        }
      />
      <InventoryTabs />

      {showNewItem ? (
        <NewItemForm
          locations={locations}
          onClose={() => setShowNewItem(false)}
          onCreated={() => {
            setShowNewItem(false);
            refetch();
          }}
        />
      ) : null}

      {adjustTarget ? (
        <AdjustStockForm
          locations={locations}
          target={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onAdjusted={() => {
            setAdjustTarget(null);
            refetch();
          }}
        />
      ) : null}

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
            <Th>Variant</Th>
            <Th>Location</Th>
            <Th className="text-right">On hand</Th>
            <Th className="text-right">Reserved</Th>
            <Th className="text-right">Available</Th>
            <Th className="text-right">Reorder point</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={7}>Loading inventory…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={7}>No inventory items yet.</EmptyRow>
          ) : (
            items.map((item) => {
              const low = item.available <= item.reorderPoint;
              return (
                <Tr key={item.id} className={low ? 'bg-amber-50/40' : undefined}>
                  <Td className="font-mono text-xs text-neutral-700" title={item.variantId}>
                    {shortId(item.variantId)}
                  </Td>
                  <Td className="text-neutral-900">{locationName(item.locationId)}</Td>
                  <Td className="text-right tabular-nums">{item.onHand}</Td>
                  <Td className="text-right tabular-nums">{item.reserved}</Td>
                  <Td className="text-right tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      {item.available}
                      {low ? <Badge variant="warning">Low stock</Badge> : null}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums">{item.reorderPoint}</Td>
                  <Td className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowNewItem(false);
                        setAdjustTarget({
                          variantId: item.variantId,
                          locationId: item.locationId,
                        });
                      }}
                    >
                      Adjust
                    </Button>
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
            className="h-8 w-20"
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Page {list?.page ?? page} of {totalPages} · {total} item{total === 1 ? '' : 's'}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Inline panel: post a stock movement against a variant/location. */
function AdjustStockForm({
  locations,
  target,
  onClose,
  onAdjusted,
}: {
  locations: Location[];
  target: AdjustTarget;
  onClose: () => void;
  onAdjusted: () => void;
}) {
  const [variantId, setVariantId] = React.useState(target.variantId);
  const [locationId, setLocationId] = React.useState(target.locationId);
  const [delta, setDelta] = React.useState('');
  const [type, setType] = React.useState<MovementType>('ADJUSTMENT');
  const [reason, setReason] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const deltaNum = Number(delta);
    if (!variantId.trim()) {
      setError('Variant ID is required.');
      return;
    }
    if (!locationId) {
      setError('Location is required.');
      return;
    }
    if (!delta.trim() || Number.isNaN(deltaNum) || deltaNum === 0) {
      setError('Delta must be a non-zero number.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/inventory/adjustments', {
        variantId: variantId.trim(),
        locationId,
        delta: deltaNum,
        type,
        reason: reason.trim() || undefined,
      });
      onAdjusted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to adjust stock.');
      setSubmitting(false);
    }
  }

  return (
    <Card variant="outline" padding="md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Adjust stock</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Variant ID" htmlFor="adj-variant" required>
          <Input
            id="adj-variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="variant id"
            required
          />
        </Field>
        <Field label="Location" htmlFor="adj-location" required>
          <Select
            id="adj-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
          >
            <option value="">Select a location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Delta" htmlFor="adj-delta" required hint="Positive to add, negative to remove.">
          <Input
            id="adj-delta"
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="e.g. 10 or -5"
            required
          />
        </Field>
        <Field label="Type" htmlFor="adj-type" required>
          <Select
            id="adj-type"
            value={type}
            onChange={(e) => setType(e.target.value as MovementType)}
          >
            {MOVEMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason" htmlFor="adj-reason" className="sm:col-span-2">
          <Input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional note, e.g. cycle count correction"
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" isLoading={submitting}>
            Apply adjustment
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Inline panel: create a new inventory item for a variant/location. */
function NewItemForm({
  locations,
  onClose,
  onCreated,
}: {
  locations: Location[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [variantId, setVariantId] = React.useState('');
  const [locationId, setLocationId] = React.useState('');
  const [onHand, setOnHand] = React.useState('0');
  const [reorderPoint, setReorderPoint] = React.useState('0');
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!variantId.trim()) {
      setError('Variant ID is required.');
      return;
    }
    if (!locationId) {
      setError('Location is required.');
      return;
    }

    setSubmitting(true);
    try {
      await apiPost('/inventory', {
        variantId: variantId.trim(),
        locationId,
        onHand: Number(onHand) || 0,
        reorderPoint: Number(reorderPoint) || 0,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create inventory item.');
      setSubmitting(false);
    }
  }

  return (
    <Card variant="outline" padding="md">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">New inventory item</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
      <form onSubmit={onSubmit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Variant ID" htmlFor="new-variant" required>
          <Input
            id="new-variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="variant id"
            required
          />
        </Field>
        <Field label="Location" htmlFor="new-location" required>
          <Select
            id="new-location"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            required
          >
            <option value="">Select a location…</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="On hand" htmlFor="new-onhand">
          <Input
            id="new-onhand"
            type="number"
            min={0}
            value={onHand}
            onChange={(e) => setOnHand(e.target.value)}
          />
        </Field>
        <Field label="Reorder point" htmlFor="new-reorder">
          <Input
            id="new-reorder"
            type="number"
            min={0}
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm font-medium text-danger sm:col-span-2">
            {error}
          </p>
        ) : null}

        <div className="flex items-center gap-2 sm:col-span-2">
          <Button type="submit" isLoading={submitting}>
            Create item
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
