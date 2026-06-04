'use client';

import * as React from 'react';
import { Button, Badge, Card, type BadgeVariant } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Field, Input } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';

interface JobSummary {
  id: string;
  status: string;
  source: string;
  framesExtracted: number;
  productsFound: number;
  createdAt: string;
  completedAt: string | null;
  _count?: { results: number };
}
interface ResultReview {
  id: string;
  title: string | null;
  priceCents: number | null;
  currency: string | null;
  brandGuess: string | null;
  categoryGuess: string | null;
  overallConfidence: number;
  reviewItem: { decision: string } | null;
  product: { id: string; slug: string; status: string } | null;
}
interface JobDetail extends JobSummary {
  results: ResultReview[];
}

function money(cents: number | null, currency = 'USD'): string {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
function jobStatusVariant(s: string): BadgeVariant {
  if (s === 'AWAITING_REVIEW') return 'warning';
  if (s === 'PUBLISHED') return 'success';
  if (s === 'FAILED' || s === 'CANCELLED') return 'danger';
  return 'info'; // QUEUED/INGESTING/ANALYZING/…
}
/** Confidence → triage band (XT-07). */
function band(c: number): { label: string; variant: BadgeVariant } {
  if (c >= 0.85) return { label: 'High', variant: 'success' };
  if (c >= 0.65) return { label: 'Good', variant: 'info' };
  if (c >= 0.4) return { label: 'Review', variant: 'warning' };
  return { label: 'Low', variant: 'danger' };
}

export default function ExtractionPage() {
  const [list, setList] = React.useState<Paginated<JobSummary> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [mediaId, setMediaId] = React.useState('');
  const [starting, setStarting] = React.useState(false);
  const [selected, setSelected] = React.useState<JobDetail | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setList(await apiGet<Paginated<JobSummary>>('/extractions?page=1&pageSize=20'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load extraction jobs.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function startExtraction() {
    if (!mediaId.trim()) return;
    setStarting(true);
    setError(null);
    try {
      await apiPost('/extractions', { mediaId: mediaId.trim() });
      setMediaId('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start extraction.');
    } finally {
      setStarting(false);
    }
  }

  async function openJob(id: string) {
    setError(null);
    try {
      setSelected(await apiGet<JobDetail>(`/extractions/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load job.');
    }
  }

  const items = list?.items ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="AI Extraction"
        description="Film your shelves → AI drafts a catalog → you review &amp; accept. Nothing publishes on its own."
      />

      <Card variant="outline" padding="md">
        <h3 className="mb-2 text-sm font-semibold text-neutral-900">Start a new extraction</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Media asset ID" htmlFor="mediaId" hint="An uploaded video/photo asset (upload UI coming soon).">
            <Input
              id="mediaId"
              value={mediaId}
              onChange={(e) => setMediaId(e.target.value)}
              placeholder="media asset id"
              className="w-80"
            />
          </Field>
          <Button isLoading={starting} disabled={!mediaId.trim()} onClick={startExtraction}>
            Start extraction
          </Button>
        </div>
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Table>
        <THead>
          <Tr>
            <Th>Job</Th>
            <Th>Status</Th>
            <Th className="text-right">Frames</Th>
            <Th className="text-right">Products</Th>
            <Th>Created</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={6}>Loading…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={6}>No extraction jobs yet.</EmptyRow>
          ) : (
            items.map((j) => (
              <Tr key={j.id}>
                <Td className="font-mono text-xs text-neutral-700">{j.id.slice(0, 10)}…</Td>
                <Td>
                  <Badge variant={jobStatusVariant(j.status)}>{j.status}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{j.framesExtracted}</Td>
                <Td className="text-right tabular-nums">{j._count?.results ?? j.productsFound}</Td>
                <Td className="text-neutral-500">{new Date(j.createdAt).toLocaleDateString()}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openJob(j.id)}>
                    Review
                  </Button>
                </Td>
              </Tr>
            ))
          )}
        </TBody>
      </Table>

      {selected ? (
        <JobReviewPanel
          job={selected}
          onClose={() => setSelected(null)}
          onChanged={async () => {
            await openJob(selected.id);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

/** Inline review: triage-band result grid + accept→draft-product per result. */
function JobReviewPanel({
  job,
  onClose,
  onChanged,
}: {
  job: JobDetail;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function accept(resultId: string) {
    setBusyId(resultId);
    setError(null);
    try {
      await apiPost(`/extractions/results/${resultId}/accept`, {});
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept this result.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card variant="outline" padding="md">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-900">
          Review job{' '}
          <span className="font-mono text-sm text-neutral-500">{job.id.slice(0, 10)}…</span>{' '}
          <Badge variant={jobStatusVariant(job.status)}>{job.status}</Badge>
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <p className="mt-1 text-xs text-neutral-500">
        Accept turns a detected product into a DRAFT — then publish it from Catalog.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5">Detected product</th>
              <th className="py-1.5">Confidence</th>
              <th className="py-1.5 text-right">Price</th>
              <th className="py-1.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {job.results.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-sm text-neutral-400">
                  No results yet — the job is still {job.status.toLowerCase()}.
                </td>
              </tr>
            ) : (
              job.results.map((r) => {
                const b = band(r.overallConfidence);
                const accepted = Boolean(r.product) || r.reviewItem?.decision === 'ACCEPTED';
                return (
                  <tr key={r.id}>
                    <td className="py-2 text-neutral-800">
                      {r.title ?? 'Untitled'}
                      {r.brandGuess ? <span className="text-neutral-400"> · {r.brandGuess}</span> : null}
                      {r.categoryGuess ? (
                        <span className="ml-2 text-xs text-neutral-400">{r.categoryGuess}</span>
                      ) : null}
                    </td>
                    <td className="py-2">
                      <Badge variant={b.variant}>
                        {b.label} · {Math.round(r.overallConfidence * 100)}%
                      </Badge>
                    </td>
                    <td className="py-2 text-right tabular-nums">{money(r.priceCents, r.currency ?? 'USD')}</td>
                    <td className="py-2 text-right">
                      {accepted ? (
                        <span className="text-xs font-medium text-green-700">
                          ✓ Draft{r.product ? ` (${r.product.status})` : ''}
                        </span>
                      ) : (
                        <Button size="sm" disabled={busyId === r.id} onClick={() => accept(r.id)}>
                          Accept → draft
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {error ? <p className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
    </Card>
  );
}
