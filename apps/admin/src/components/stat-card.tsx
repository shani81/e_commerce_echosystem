import { cn } from '@aicos/ui';

export type StatCardProps = {
  label: string;
  /** Placeholder value rendered as-is (Phase 0 has no live data). */
  value: string;
  /** Optional delta caption, e.g. "+12% vs last week". */
  delta?: string;
  trend?: 'up' | 'down' | 'flat';
};

/**
 * A single KPI tile for the overview grid. Values are static placeholders in
 * Phase 0; the component is shaped so live metrics can drop in unchanged later.
 */
export function StatCard({ label, value, delta, trend = 'flat' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-neutral-900">
        {value}
      </p>
      {delta ? (
        <p
          className={cn(
            'mt-1 text-xs font-medium',
            trend === 'up' && 'text-success',
            trend === 'down' && 'text-danger',
            trend === 'flat' && 'text-neutral-400',
          )}
        >
          {delta}
        </p>
      ) : (
        <p className="mt-1 text-xs text-neutral-300">No data yet</p>
      )}
    </div>
  );
}
