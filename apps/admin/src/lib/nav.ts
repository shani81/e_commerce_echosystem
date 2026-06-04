/**
 * Sidebar navigation model for the admin shell.
 *
 * Phase 0 routes are placeholders that all resolve to the dashboard overview;
 * each domain (Catalog, Orders, …) becomes its own route segment in later
 * phases. Keeping the model in one place makes the sidebar and any breadcrumb
 * logic share a single source of truth.
 */
export type NavItem = {
  label: string;
  href: string;
  /** Inline SVG path data (24x24 viewBox) for the item icon. */
  icon: string;
  /** Marks not-yet-implemented sections so the UI can hint at it. */
  placeholder?: boolean;
};

export const navItems: NavItem[] = [
  {
    label: 'Overview',
    href: '/',
    icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10',
  },
  {
    label: 'Catalog',
    href: '/catalog',
    icon: 'M4 6h16M4 12h16M4 18h10',
  },
  {
    label: 'Import',
    href: '/imports',
    icon: 'M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3',
  },
  {
    label: 'Orders',
    href: '/orders',
    icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 4h12M9 21a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
  },
  {
    label: 'Returns',
    href: '/returns',
    icon: 'M3 7h13a4 4 0 014 4v1a4 4 0 01-4 4H6m0 0l3-3m-3 3l3 3',
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  },
  {
    label: 'Payments',
    href: '/settings/connect',
    icon: 'M3 10h18M7 15h1m4 0h1M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  },
  {
    label: 'Privacy',
    href: '/privacy',
    icon: 'M12 3l7 4v5c0 4.4-3 8.5-7 9.5-4-1-7-5.1-7-9.5V7l7-4z',
  },
  {
    label: 'AI Extraction',
    href: '/extraction',
    icon: 'M12 3v2m0 14v2m9-9h-2M5 12H3m14.95 6.36l-1.41-1.41M6.46 6.46L5.05 5.05m13.9 0l-1.41 1.41M6.46 17.54l-1.41 1.41M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
];
