'use client';

import * as React from 'react';
import Link from 'next/link';
import { Badge, Button } from '@aicos/ui';
import {
  formatCents,
  lookupOrder,
  requestReturn,
  requestDataAction,
  type OrderLookupResult,
} from '@/lib/storefront-api';

export default function CustomerPortalPage() {
  const [email, setEmail] = React.useState('');
  const [orderNumber, setOrderNumber] = React.useState('');
  const [order, setOrder] = React.useState<OrderLookupResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const doLookup = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrder(await lookupOrder(email.trim(), orderNumber.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }, [email, orderNumber]);

  async function onLookup(e: React.FormEvent) {
    e.preventDefault();
    setOrder(null);
    await doLookup();
  }

  return (
    <main className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/shop" className="text-sm font-medium text-neutral-600 hover:text-neutral-900">
            ← Shop
          </Link>
          <span className="text-lg font-semibold tracking-tight text-neutral-900">Your orders</span>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <form onSubmit={onLookup} className="rounded-xl border border-neutral-200 bg-white p-4">
          <h1 className="mb-3 text-base font-semibold text-neutral-900">Look up an order</h1>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email used at checkout"
              className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
            />
            <input
              type="text"
              required
              value={orderNumber}
              onChange={(e) => setOrderNumber(e.target.value)}
              placeholder="Order number (e.g. 1001)"
              className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
            />
          </div>
          <div className="mt-3">
            <Button type="submit" isLoading={loading}>
              Find my order
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        </form>

        {order ? <OrderView order={order} email={email.trim()} onChanged={doLookup} /> : null}

        <DataRequest defaultEmail={email} />
      </section>
    </main>
  );
}

function statusVariant(s: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (['PAID', 'FULFILLED', 'COMPLETED', 'DELIVERED', 'REFUNDED', 'APPROVED'].includes(s)) return 'success';
  if (['PENDING', 'DRAFT', 'UNFULFILLED', 'REQUESTED', 'IN_TRANSIT'].includes(s)) return 'warning';
  if (['CANCELLED', 'REJECTED', 'FAILED'].includes(s)) return 'danger';
  return 'neutral';
}

function OrderView({
  order,
  email,
  onChanged,
}: {
  order: OrderLookupResult;
  email: string;
  onChanged: () => void;
}) {
  const [selected, setSelected] = React.useState<Record<string, number>>({});
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const cur = order.currency;
  const lines = Object.entries(selected).filter(([, q]) => q > 0);

  async function submitReturn() {
    if (lines.length === 0) {
      setErr('Select at least one item to return.');
      return;
    }
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const ret = await requestReturn(
        email,
        order.number,
        lines.map(([orderItemId, quantity]) => ({ orderItemId, quantity })),
        reason.trim() || undefined,
      );
      setMsg(`Return request submitted (${ret.status}).`);
      setSelected({});
      setReason('');
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit return');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-neutral-900">Order #{order.number}</h2>
        <Badge variant={statusVariant(order.status)}>{order.status}</Badge>
        <Badge variant={statusVariant(order.financialStatus)}>{order.financialStatus}</Badge>
        <Badge variant={statusVariant(order.fulfillmentStatus)}>{order.fulfillmentStatus}</Badge>
        <span className="ml-auto text-sm font-semibold text-neutral-900">
          {formatCents(order.totalCents, cur)}
        </span>
      </div>

      {order.shipments.length > 0 ? (
        <div className="rounded-lg bg-neutral-50 p-3 text-sm">
          {order.shipments.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
              <span className="text-neutral-600">{s.carrier ?? 'Shipment'}</span>
              {s.trackingNumber ? (
                <span className="font-mono text-xs text-neutral-500">{s.trackingNumber}</span>
              ) : null}
              {s.trackingUrl ? (
                <a href={s.trackingUrl} className="text-brand-700 hover:underline">
                  Track →
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Items — select to return
        </h3>
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {order.items.map((it) => (
            <li key={it.orderItemId} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={(selected[it.orderItemId] ?? 0) > 0}
                onChange={(e) =>
                  setSelected((prev) => ({
                    ...prev,
                    [it.orderItemId]: e.target.checked ? it.quantity : 0,
                  }))
                }
              />
              <span className="min-w-0 flex-1 truncate text-neutral-800">
                {it.productTitle}
                {it.variantTitle ? <span className="text-neutral-400"> · {it.variantTitle}</span> : null}
              </span>
              <span className="text-neutral-500">×{it.quantity}</span>
              {(selected[it.orderItemId] ?? 0) > 0 ? (
                <input
                  type="number"
                  min={1}
                  max={it.quantity}
                  value={selected[it.orderItemId]}
                  onChange={(e) =>
                    setSelected((prev) => ({
                      ...prev,
                      [it.orderItemId]: Math.max(1, Math.min(it.quantity, Number(e.target.value) || 1)),
                    }))
                  }
                  className="h-7 w-14 rounded border border-neutral-300 px-2 text-sm"
                />
              ) : null}
              <span className="w-20 text-right font-medium text-neutral-900">
                {formatCents(it.totalCents, cur)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {lines.length > 0 ? (
        <div className="space-y-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for return (optional)"
            rows={2}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20"
          />
          <Button variant="outline" isLoading={busy} onClick={submitReturn}>
            Request return ({lines.length} item{lines.length === 1 ? '' : 's'})
          </Button>
        </div>
      ) : null}

      {order.returns.length > 0 ? (
        <div className="text-sm text-neutral-500">
          Returns:{' '}
          {order.returns.map((r) => (
            <span key={r.id} className="mr-2">
              <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
            </span>
          ))}
        </div>
      ) : null}

      {msg ? <p className="text-sm font-medium text-green-700">{msg}</p> : null}
      {err ? <p className="text-sm font-medium text-red-700">{err}</p> : null}
    </div>
  );
}

function DataRequest({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = React.useState(defaultEmail);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<'EXPORT' | 'ERASURE' | null>(null);

  React.useEffect(() => setEmail(defaultEmail), [defaultEmail]);

  async function submit(type: 'EXPORT' | 'ERASURE') {
    if (!email.trim()) return;
    setBusy(type);
    setMsg(null);
    try {
      const r = await requestDataAction(email.trim(), type);
      setMsg(`Request received (${r.status}). We'll action it by ${new Date(r.dueAt).toLocaleDateString()}.`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="rounded-xl border border-neutral-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-neutral-900">
        Privacy & your data (GDPR)
      </summary>
      <p className="mt-2 text-sm text-neutral-600">
        Request a copy of your data, or ask us to erase it. We action requests within 30 days.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email"
          className="h-9 flex-1 rounded-lg border border-neutral-300 px-3 text-sm"
        />
        <Button size="sm" variant="outline" isLoading={busy === 'EXPORT'} onClick={() => submit('EXPORT')}>
          Export my data
        </Button>
        <Button size="sm" variant="ghost" isLoading={busy === 'ERASURE'} onClick={() => submit('ERASURE')}>
          Erase my data
        </Button>
      </div>
      {msg ? <p className="mt-2 text-sm text-neutral-700">{msg}</p> : null}
    </details>
  );
}
