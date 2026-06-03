'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@aicos/ui';
import { navItems, type NavItem } from '@/lib/nav';

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-brand-600 text-white shadow-sm'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          'h-5 w-5 shrink-0',
          active ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-600',
        )}
        aria-hidden="true"
      >
        <path d={item.icon} />
      </svg>
      <span className="flex-1 truncate">{item.label}</span>
      {item.placeholder ? (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-neutral-400',
          )}
        >
          Soon
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-neutral-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-neutral-200 px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          A
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-neutral-900">AICOS</p>
          <p className="text-xs text-neutral-400">Admin Console</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return <NavLink key={item.href} item={item} active={active} />;
        })}
      </nav>

      <div className="border-t border-neutral-200 p-4">
        <div className="rounded-lg bg-neutral-50 p-3">
          <p className="text-xs font-medium text-neutral-700">Phase 0 shell</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Placeholder navigation. Real data wiring lands in later phases.
          </p>
        </div>
      </div>
    </aside>
  );
}
