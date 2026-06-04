'use client';

import * as React from 'react';
import { Button, Badge, Card, type BadgeVariant } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Field, Input } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, apiPost, apiDelete, ApiError, type Paginated } from '@/lib/api';

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
  barcode: string | null;
  brandGuess: string | null;
  categoryGuess: string | null;
  overallConfidence: number;
  reviewItem: { decision: string } | null;
  product: { id: string; slug: string; status: string } | null;
}
interface FrameInfo {
  id: string;
  frameIndex: number;
  timestampMs: number | null;
  blurScore: number | null;
  barcode: string | null;
  thumbnailUrl: string | null;
}
interface JobDetail extends JobSummary {
  errorMessage: string | null;
  results: ResultReview[];
  frames: FrameInfo[];
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
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [selected, setSelected] = React.useState<JobDetail | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

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

  // Upload a video → presigned PUT → confirm → start extraction, in one go.
  async function uploadAndStart() {
    if (!file) return;
    setUploading(true);
    setError(null);
    const contentType = file.type || 'application/octet-stream';
    try {
      const presign = await apiPost<{ assetId: string; uploadUrl: string }>('/media/uploads', {
        filename: file.name,
        contentType,
        kind: 'VIDEO',
      });
      const put = await fetch(presign.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': contentType },
      });
      if (!put.ok) {
        throw new Error(`Storage upload failed (${put.status}) — check MinIO/S3 CORS for the admin origin.`);
      }
      await apiPost(`/media/${presign.assetId}/confirm`, { sizeBytes: file.size });
      await apiPost('/extractions', { mediaId: presign.assetId });
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
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

  async function deleteJob(id: string) {
    if (!window.confirm('Delete this extraction job and its frames/results? Accepted draft products are kept.')) {
      return;
    }
    setDeletingId(id);
    setError(null);
    try {
      await apiDelete(`/extractions/${id}`);
      if (selected?.id === id) setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete this job.');
    } finally {
      setDeletingId(null);
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

        {/* Upload a shelf video → AI drafts the catalog. */}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Shelf video" htmlFor="video" hint="Film your shelves; we sample frames and extract products.">
            <input
              id="video"
              type="file"
              accept="video/*,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-80 text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-700"
            />
          </Field>
          <Button isLoading={uploading} disabled={!file} onClick={uploadAndStart}>
            Upload &amp; extract
          </Button>
        </div>

        {/* Fallback: start from an already-uploaded media asset id. */}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500">or start from an existing media asset id</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Input
              value={mediaId}
              onChange={(e) => setMediaId(e.target.value)}
              placeholder="media asset id"
              className="w-80"
            />
            <Button variant="outline" isLoading={starting} disabled={!mediaId.trim()} onClick={startExtraction}>
              Start extraction
            </Button>
          </div>
        </details>
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
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openJob(j.id)}>
                      Review
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={deletingId === j.id}
                      onClick={() => deleteJob(j.id)}
                    >
                      {deletingId === j.id ? 'Deleting…' : 'Delete'}
                    </Button>
                  </div>
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

      {job.errorMessage ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span className="font-semibold">Showing sample data.</span> The AI didn&apos;t return live
          results for this job:{' '}
          <span className="break-words font-mono text-xs text-amber-700">{job.errorMessage}</span>
        </div>
      ) : null}

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
                      {r.barcode ? (
                        <span className="ml-2 rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs text-neutral-500">
                          {r.barcode}
                        </span>
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

      {job.frames.length > 0 ? (
        <div className="mt-5">
          <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Frames the AI analyzed ({job.frames.length})
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="py-1.5">Preview</th>
                  <th className="py-1.5">#</th>
                  <th className="py-1.5">Time</th>
                  <th className="py-1.5 text-right">Sharpness</th>
                  <th className="py-1.5">Barcode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {job.frames.map((f) => (
                  <tr key={f.id}>
                    <td className="py-1.5">
                      {f.thumbnailUrl ? (
                        <img
                          src={f.thumbnailUrl}
                          alt={`Frame ${f.frameIndex}`}
                          className="h-14 w-24 rounded border border-neutral-200 object-cover"
                        />
                      ) : (
                        <span className="text-xs text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-1.5 text-neutral-700">{f.frameIndex}</td>
                    <td className="py-1.5 tabular-nums text-neutral-600">
                      {f.timestampMs != null ? `${(f.timestampMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-neutral-600">
                      {f.blurScore != null ? Math.round(f.blurScore) : '—'}
                    </td>
                    <td className="py-1.5 font-mono text-xs text-neutral-600">{f.barcode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            Evenly sampled across the video; blurry &amp; near-duplicate frames were dropped. Higher
            sharpness = clearer.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm font-medium text-danger">{error}</p> : null}
    </Card>
  );
}
