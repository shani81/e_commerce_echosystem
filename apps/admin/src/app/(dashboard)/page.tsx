'use client';

import * as React from 'react';
import { StatCard, type StatCardProps } from '@/components/stat-card';
import { apiGet, type Paginated } from '@/lib/api';

interface Kpis {
  activeProducts: number | null;
  totalProducts: number | null;
  lowStockSkus: number | null;
  locations: number | null;
}

const placeholderPanels = [
  {
    title: 'Sales over time',
    hint: 'Daily revenue and order volume — coming in M1.2.',
  },
  {
    title: 'Recent activity',
    hint: 'Latest orders, inventory changes and AI extraction runs — coming in M1.3.',
  },
];

/** Renders a count or an em dash when the metric could not be loaded. */
function fmt(value: number | null): string {
  return value === null ? '—' : String(value);
}

export default function OverviewPage() {
  const [kpis, setKpis] = React.useState<Kpis>({
    activeProducts: null,
    totalProducts: null,
    lowStockSkus: null,
    locations: null,
  });
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    // Each KPI is fetched independently so one failing endpoint still leaves
    // the others populated; a rejected fetch surfaces as "—".
    async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
      try {
        return await fn();
      } catch {
        return null;
      }
    }

    async function load() {
      setLoading(true);
      const [active, total, alerts, locations] = await Promise.all([
        safe(() => apiGet<Paginated<unknown>>('/products?status=ACTIVE&pageSize=1')),
        safe(() => apiGet<Paginated<unknown>>('/products?pageSize=1')),
        safe(() => apiGet<unknown[]>('/inventory/alerts')),
        safe(() => apiGet<unknown[]>('/locations')),
      ]);
      if (cancelled) return;
      setKpis({
        activeProducts: active?.total ?? null,
        totalProducts: total?.total ?? null,
        lowStockSkus: Array.isArray(alerts) ? alerts.length : null,
        locations: Array.isArray(locations) ? locations.length : null,
      });
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats: StatCardProps[] = [
    {
      label: 'Active products',
      value: loading ? '…' : fmt(kpis.activeProducts),
      delta: 'Published & sellable',
      trend: 'flat',
    },
    {
      label: 'Total products',
      value: loading ? '…' : fmt(kpis.totalProducts),
      delta: 'All statuses',
      trend: 'flat',
    },
    {
      label: 'Low-stock SKUs',
      value: loading ? '…' : fmt(kpis.lowStockSkus),
      delta: 'At or below reorder point',
      trend: kpis.lowStockSkus && kpis.lowStockSkus > 0 ? 'down' : 'flat',
    },
    {
      label: 'Locations',
      value: loading ? '…' : fmt(kpis.locations),
      delta: 'Stock locations',
      trend: 'flat',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Dashboard</h2>
        <p className="mt-1 text-sm text-neutral-500">
          A high-level snapshot of the store.
        </p>
      </div>

      <section
        aria-label="Key metrics"
        aria-busy={loading || undefined}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {placeholderPanels.map((panel) => (
          <div
            key={panel.title}
            className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-neutral-900">{panel.title}</h3>
            <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed border-neutral-200 bg-neutral-50">
              <p className="max-w-xs px-6 text-center text-sm text-neutral-400">
                {panel.hint}
              </p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
