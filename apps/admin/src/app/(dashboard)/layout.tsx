import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';

/**
 * Authenticated dashboard chrome: a persistent left sidebar plus a topbar over
 * a scrollable content region. The `(dashboard)` route group keeps this shell
 * out of the URL while still scoping it to the in-app pages (the `/login` route
 * lives outside the group and renders without this chrome).
 *
 * Session enforcement is intentionally absent in Phase 0 — this is an
 * authenticated-*looking* shell. A middleware/redirect guard slots in here later.
 */
export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title="Overview" />
        <main className="flex-1 px-4 py-6 lg:px-6">{children}</main>
      </div>
    </div>
  );
}
