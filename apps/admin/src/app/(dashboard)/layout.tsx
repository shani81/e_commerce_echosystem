import type { ReactNode } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { AuthGuard } from '@/components/auth-guard';

/**
 * Authenticated dashboard chrome: a persistent left sidebar plus a topbar over a
 * scrollable content region. `AuthGuard` resolves the session and redirects to
 * /login when there is none (the /login route lives outside this group).
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-neutral-50">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 py-6 lg:px-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
