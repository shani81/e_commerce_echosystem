'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@aicos/ui';

const tabs = [
  { label: 'Items', href: '/inventory' },
  { label: 'Locations', href: '/inventory/locations' },
];

/** Items | Locations sub-navigation shown on all inventory pages. */
export function InventoryTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Inventory sections"
      className="flex gap-1 border-b border-neutral-200"
    >
      {tabs.map((tab) => {
        const active =
          tab.href === '/inventory'
            ? pathname === '/inventory'
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
