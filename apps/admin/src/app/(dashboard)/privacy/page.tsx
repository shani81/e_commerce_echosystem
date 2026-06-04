'use client';

import * as React from 'react';
import { Button, Badge, type BadgeVariant } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, ApiError, type Paginated } from '@/lib/api';

interface DsarRequest {
  id: string;
  type: string;
  status: string;
  subjectEmail: string;
  dueAt: string;
  completedAt: string | null;
  createdAt: string;
}

function statusVariant(s: string): BadgeVariant {
  if (s === 'COMPLETED') return 'success';
  if (s === 'RECEIVED' || s === 'PROCESSING') return 'warning';
  if (s === 'REJECTED') return 'danger';
  return 'neutral';
}

export default function PrivacyPage() {
  const [list, setList] = React.useState<Paginated<DsarRequest> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await apiGet<Paginated<DsarRequest>>(`/gdpr/dsar?page=${page}&pageSize=20`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load DSAR requests.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  React.useEffect(() => {
    load();
  }, [load]);

  const items = list?.items ?? [];
  const total = list?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Privacy & GDPR"
        description="Data-subject requests (export / erasure) from the storefront. Fulfilled automatically within the 30-day SLA."
      />

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Table>
        <THead>
          <Tr>
            <Th>Subject</Th>
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>Requested</Th>
            <Th>Due</Th>
            <Th>Completed</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={6}>Loading…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={6}>No data requests yet.</EmptyRow>
          ) : (
            items.map((r) => (
              <Tr key={r.id}>
                <Td className="text-neutral-800">{r.subjectEmail}</Td>
                <Td>
                  <Badge variant={r.type === 'ERASURE' ? 'danger' : 'info'}>{r.type}</Badge>
                </Td>
                <Td>
                  <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                </Td>
                <Td className="text-neutral-500">{new Date(r.createdAt).toLocaleDateString()}</Td>
                <Td className="text-neutral-500">{new Date(r.dueAt).toLocaleDateString()}</Td>
                <Td className="text-neutral-500">
                  {r.completedAt ? new Date(r.completedAt).toLocaleString() : '—'}
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>

      <div className="flex items-center justify-end gap-3 text-sm text-neutral-600">
        <span>
          Page {list?.page ?? page} of {totalPages} · {total} request{total === 1 ? '' : 's'}
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
