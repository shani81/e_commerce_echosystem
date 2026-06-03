'use client';

import * as React from 'react';
import { Button, Badge, Card, type BadgeVariant } from '@aicos/ui';
import { PageHeader } from '@/components/ui/page-header';
import { Select } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';

interface OrderSummary {
  id: string;
  number: string;
  status: string;
  financialStatus: string;
  totalCents: number;
  currency: string;
  email: string | null;
  itemCount: number;
  createdAt: string;
}

interface OrderItem {
  id: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}
interface Payment {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  failureReason: string | null;
}
interface Refund {
  id: string;
  amountCents: number;
  currency: string;
  reason: string | null;
  createdAt: string;
}
interface OrderDetail extends OrderSummary {
  fulfillmentStatus: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  applicationFeeCents: number;
  placedAt: string | null;
  items: OrderItem[];
  payments: Payment[];
  refunds: Refund[];
}

const ORDER_STATUSES = [
  'DRAFT',
  'PENDING',
  'PAID',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
] as const;

function money(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}
function statusVariant(s: string): BadgeVariant {
  if (['PAID', 'FULFILLED', 'COMPLETED', 'PARTIALLY_FULFILLED'].includes(s)) return 'success';
  if (['DRAFT', 'PENDING', 'UNPAID'].includes(s)) return 'warning';
  if (['CANCELLED', 'VOIDED'].includes(s)) return 'danger';
  if (['AUTHORIZED'].includes(s)) return 'info';
  return 'neutral';
}
function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}

export default function OrdersPage() {
  const [list, setList] = React.useState<Paginated<OrderSummary> | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [status, setStatus] = React.useState('');
  const [selected, setSelected] = React.useState<OrderDetail | null>(null);

  const loadList = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) qs.set('status', status);
      setList(await apiGet<Paginated<OrderSummary>>(`/orders?${qs.toString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load orders.');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status]);

  React.useEffect(() => {
    loadList();
  }, [loadList]);

  const items = list?.items ?? [];
  const total = list?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function openOrder(id: string) {
    try {
      setSelected(await apiGet<OrderDetail>(`/orders/${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load order.');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Orders" description="Customer orders, payments and refunds." />

      <div className="flex items-center gap-2 text-sm text-neutral-600">
        <span>Status</span>
        <Select
          className="h-8 w-48"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="">All</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

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
            <Th>Order</Th>
            <Th>Status</Th>
            <Th>Payment</Th>
            <Th className="text-right">Items</Th>
            <Th className="text-right">Total</Th>
            <Th>Email</Th>
            <Th className="text-right">Actions</Th>
          </Tr>
        </THead>
        <TBody>
          {loading ? (
            <EmptyRow colSpan={7}>Loading orders…</EmptyRow>
          ) : items.length === 0 ? (
            <EmptyRow colSpan={7}>No orders yet.</EmptyRow>
          ) : (
            items.map((o) => (
              <Tr key={o.id}>
                <Td className="font-medium text-neutral-900">#{o.number}</Td>
                <Td>
                  <Badge variant={statusVariant(o.status)}>{o.status}</Badge>
                </Td>
                <Td>
                  <Badge variant={statusVariant(o.financialStatus)}>{o.financialStatus}</Badge>
                </Td>
                <Td className="text-right tabular-nums">{o.itemCount}</Td>
                <Td className="text-right tabular-nums">{money(o.totalCents, o.currency)}</Td>
                <Td className="text-neutral-600">{o.email ?? '—'}</Td>
                <Td className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openOrder(o.id)}>
                    View
                  </Button>
                </Td>
              </Tr>
            ))
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
            Page {list?.page ?? page} of {totalPages} · {total} order{total === 1 ? '' : 's'}
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

      {selected ? (
        <OrderDetailPanel
          order={selected}
          onClose={() => setSelected(null)}
          onChanged={(next) => {
            setSelected(next);
            loadList();
          }}
        />
      ) : null}
    </div>
  );
}

/** Inline detail panel: line items, payments, refunds, and a refund action. */
function OrderDetailPanel({
  order,
  onClose,
  onChanged,
}: {
  order: OrderDetail;
  onClose: () => void;
  onChanged: (next: OrderDetail) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const captured = order.payments.find((p) => p.status === 'SUCCEEDED');
  const refundable =
    Boolean(captured) && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.financialStatus);

  async function refund() {
    if (!window.confirm(`Refund order #${order.number} in full?`)) return;
    setBusy(true);
    setError(null);
    try {
      const next = await apiPost<OrderDetail>(`/orders/${order.id}/refund`, {});
      onChanged(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Refund failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card variant="outline" padding="md">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-semibold text-neutral-900">
            Order #{order.number}{' '}
            <Badge variant={statusVariant(order.status)}>{order.status}</Badge>{' '}
            <Badge variant={statusVariant(order.financialStatus)}>{order.financialStatus}</Badge>
          </h3>
          <p className="mt-1 text-xs text-neutral-500">
            {order.email ?? 'no email'} · placed{' '}
            {order.placedAt ? new Date(order.placedAt).toLocaleString() : '—'}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="py-1.5">Item</th>
              <th className="py-1.5 text-right">Qty</th>
              <th className="py-1.5 text-right">Unit</th>
              <th className="py-1.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {order.items.map((it) => (
              <tr key={it.id}>
                <td className="py-2 text-neutral-800">
                  {it.productTitle}
                  {it.variantTitle ? <span className="text-neutral-400"> · {it.variantTitle}</span> : null}
                  {it.sku ? <span className="ml-2 font-mono text-xs text-neutral-400">{it.sku}</span> : null}
                </td>
                <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                <td className="py-2 text-right tabular-nums">{money(it.unitPriceCents, order.currency)}</td>
                <td className="py-2 text-right tabular-nums">{money(it.totalCents, order.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <dl className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
        <Row label="Subtotal" value={money(order.subtotalCents, order.currency)} />
        {order.taxCents > 0 ? <Row label="Tax" value={money(order.taxCents, order.currency)} /> : null}
        {order.shippingCents > 0 ? (
          <Row label="Shipping" value={money(order.shippingCents, order.currency)} />
        ) : null}
        <Row label="Total" value={money(order.totalCents, order.currency)} strong />
        {order.applicationFeeCents > 0 ? (
          <Row label="Platform fee" value={money(order.applicationFeeCents, order.currency)} />
        ) : null}
      </dl>

      {order.payments.length > 0 ? (
        <div className="mt-4 text-xs text-neutral-500">
          Payment:{' '}
          {order.payments.map((p) => (
            <span key={p.id} className="mr-3">
              <Badge variant={statusVariant(p.status)}>{p.status}</Badge>{' '}
              {money(p.amountCents, p.currency)}
              {p.stripePaymentIntentId ? (
                <span className="ml-1 font-mono">{shortId(p.stripePaymentIntentId)}</span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      {order.refunds.length > 0 ? (
        <div className="mt-2 text-xs text-neutral-500">
          Refunds:{' '}
          {order.refunds.map((r) => (
            <span key={r.id} className="mr-3">
              {money(r.amountCents, r.currency)}
              {r.reason ? ` (${r.reason})` : ''}
            </span>
          ))}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      {refundable ? (
        <div className="mt-4">
          <Button variant="outline" isLoading={busy} onClick={refund}>
            Refund order
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={strong ? 'font-semibold text-neutral-900' : 'text-neutral-700'}>{value}</dd>
    </div>
  );
}
