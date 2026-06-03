'use client';

import { cn } from '@aicos/ui';
import { useAuth } from '@/lib/auth';

/** Dashboard topbar: a (placeholder) search field and the signed-in account. */
export function Topbar() {
  const { user, logout } = useAuth();
  const initials = (user?.email ?? 'A').slice(0, 2).toUpperCase();
  const roleLabel = user?.roleType
    ? user.roleType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-neutral-200 bg-white/80 px-4 backdrop-blur lg:px-6">
      <label className="relative hidden sm:block">
        <span className="sr-only">Search</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
          aria-hidden="true"
        >
          <path d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
        </svg>
        <input
          type="search"
          disabled
          placeholder="Search (coming soon)"
          className={cn(
            'h-9 w-56 rounded-lg border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm',
            'text-neutral-700 placeholder:text-neutral-400 disabled:cursor-not-allowed',
          )}
        />
      </label>

      <div className="ml-auto flex items-center gap-3">
        <div className="flex items-center gap-2.5 border-r border-neutral-200 pr-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
            {initials}
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-neutral-900">{roleLabel}</p>
            <p className="text-xs text-neutral-400">{user?.email ?? ''}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
