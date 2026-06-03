'use client';

import * as React from 'react';
import { Button, Badge, type BadgeVariant } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';

interface ReturnSummary {
  id: string;
  status: string;
  orderId: string;
  orderNumber: string;
  reason: string | null;
  itemCount: number;
  createdAt: string;
}

const STATUSES = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED'] as const;

function statusVariant(s: string): BadgeVariant {
  if (['APPROVED', 'REFUNDED'].includes(s)) return 'success';
  if (['REQUESTED', 'RECEIVED'].includes(s)) return 'warning';
  if (s === 'REJECTED') return 'danger';
  return 'neutral';
}

export default function ReturnsPage() {
  const [list, setList] = React.useState<Paginated<ReturnSummary> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [status, setStatus] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: '20' });
      if (status) qs.set('status', status);
      setList(await apiGet<Paginated<ReturnSummary>>(`/returns?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load returns.');
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'reject' | 'refund') {
    if (action === 'refund' && !window.confirm('Refund this return and restock the items?')) return;
    setBusyId(id);
    setError(null);
    try {
      await apiPost(`/returns/${id}/${action}`, {});
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${action} the return.`);
    } finally {
      setBusyId(null);
    }
  }

  const items = list?.items ?? [];
  const total = list?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Returns" description="Customer return requests (RMA) — approve, reject, or refund." />

      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <span>Status</span>
        <Select
          className="h-8 w-44"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Table>
        <THead>
          <Tr>
            <Th>Order</Th>
            <Th>Status</Th>
            <Th className="text-right">Items</Th>
            <Th>Reason</Th>
            <Th>Requested</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={6}>Loading returns…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={6}>No returns yet.</EmptyRow>
          ) : (
            items.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium text-neutral-900">#{r.orderNumber}</Td>
                <Td>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{r.itemCount}</Td>
                <Td className="max-w-[16rem] truncate text-neutral-600" title={r.reason ?? ''}>
                  {r.reason ?? '—'}
                </Td>
                <Td className="text-neutral-500">{new Date(r.createdAt).toLocaleDateString()}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1.5">
                    {r.status === 'REQUESTED' ? (
                      <>
                        <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === r.id} onClick={() => act(r.id, 'reject')}>
                          Reject
                        </Button>
                      </>
                    ) : null}
                    {['APPROVED', 'RECEIVED'].includes(r.status) ? (
                      <Button size="sm" disabled={busyId === r.id} onClick={() => act(r.id, 'refund')}>
                        Refund
                      </Button>
                    ) : null}
                  </div>
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>

      <div className="flex items-center justify-end gap-3 text-sm text-neutral-600">
        <span>
          Page {list?.page ?? page} of {totalPages} · {total} return{total === 1 ? '' : 's'}
        </span>
        <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          Previous
        </Button>
        <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
