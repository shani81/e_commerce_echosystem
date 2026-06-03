import { cn } from '@aicos/ui';

/**
 * Dashboard topbar: page title slot, a (non-functional, Phase 0) search field,
 * and an account cluster. No session is wired yet — the avatar/name are static
 * placeholders that later phases replace with the authenticated user.
 */
export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-neutral-200 bg-white/80 px-4 backdrop-blur lg:px-6">
      <h1 className="text-base font-semibold text-neutral-900">{title}</h1>

      <div className="ml-auto flex items-center gap-3">
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
              'text-neutral-700 placeholder:text-neutral-400',
              'disabled:cursor-not-allowed',
            )}
          />
        </label>

        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Notifications"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-600" />
        </button>

        <div className="flex items-center gap-2 border-l border-neutral-200 pl-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-xs font-semibold text-white">
            AD
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="text-sm font-medium text-neutral-900">Admin</p>
            <p className="text-xs text-neutral-400">admin@aicos.local</p>
          </div>
        </div>
      </div>
    </header>
  );
}
