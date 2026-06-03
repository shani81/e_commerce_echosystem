import { StatCard, type StatCardProps } from '@/components/stat-card';

const stats: StatCardProps[] = [
  { label: 'Revenue (30d)', value: '—', delta: 'Awaiting data', trend: 'flat' },
  { label: 'Orders (30d)', value: '—', delta: 'Awaiting data', trend: 'flat' },
  { label: 'Active products', value: '—', delta: 'Awaiting data', trend: 'flat' },
  { label: 'Low-stock SKUs', value: '—', delta: 'Awaiting data', trend: 'flat' },
];

const panels = [
  {
    title: 'Sales over time',
    hint: 'Daily revenue and order volume will render here once the API is wired.',
  },
  {
    title: 'Recent activity',
    hint: 'Latest orders, inventory changes and AI extraction runs.',
  },
];

export default function OverviewPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-neutral-900">Dashboard</h2>
        <p className="mt-1 text-sm text-neutral-500">
          A high-level snapshot of the store. Metrics are placeholders in Phase 0.
        </p>
      </div>

      <section
        aria-label="Key metrics"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {panels.map((panel) => (
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
