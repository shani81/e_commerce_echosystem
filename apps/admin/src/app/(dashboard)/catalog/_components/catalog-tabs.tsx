'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@aicos/ui';

interface Tab {
  href: string;
  label: string;
  /** When true the tab is active only on an exact path match. */
  exact?: boolean;
}

const tabs: Tab[] = [
  { href: '/catalog', label: 'Products', exact: true },
  { href: '/catalog/categories', label: 'Categories' },
  { href: '/catalog/brands', label: 'Brands' },
];

function isActive(pathname: string, tab: Tab): boolean {
  if (tab.exact) {
    // Products tab also "owns" /catalog/new and /catalog/[id].
    return (
      pathname === tab.href ||
      pathname === '/catalog/new' ||
      (pathname.startsWith('/catalog/') &&
        pathname !== '/catalog/categories' &&
        pathname !== '/catalog/brands')
    );
  }
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/** Products | Categories | Brands sub-navigation shared by all catalog screens. */
export function CatalogTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-neutral-200" aria-label="Catalog sections">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
