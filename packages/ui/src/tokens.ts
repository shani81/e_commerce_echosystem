/**
 * AICOS design tokens.
 *
 * A modern, minimal aesthetic: a neutral slate/zinc surface scale, a single
 * indigo accent for primary actions, restrained semantic colors, an 8px spacing
 * rhythm, and soft radii. These values are the source of truth that the Tailwind
 * config in each app maps onto the `theme` (so utilities like `bg-brand-600`
 * resolve), and they are also exported for any runtime/inline use.
 *
 * Colors are plain hex (not `hsl(var(--x))`) so the tokens are usable without a
 * CSS-variable runtime; apps may still mirror them into CSS variables for
 * theming if desired.
 */

export const colors = {
  /** Primary brand accent (indigo). */
  brand: {
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
    950: '#1e1b4b',
  },
  /** Neutral surface/text scale (slate). */
  neutral: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  /** Semantic accents, used sparingly. */
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
} as const;

/** 8px base spacing rhythm. Keys are multipliers of the base unit. */
export const spacing = {
  0: '0px',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
} as const;

/** Soft, modern corner radii. */
export const radii = {
  none: '0px',
  sm: '0.25rem',
  md: '0.375rem',
  lg: '0.5rem',
  xl: '0.75rem',
  '2xl': '1rem',
  full: '9999px',
} as const;

/** Layered, low-contrast shadows for a light-touch elevation system. */
export const shadows = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(2 6 23 / 0.04)',
  md: '0 2px 8px -2px rgb(2 6 23 / 0.08), 0 1px 2px -1px rgb(2 6 23 / 0.06)',
  lg: '0 8px 24px -6px rgb(2 6 23 / 0.10), 0 2px 6px -2px rgb(2 6 23 / 0.06)',
} as const;

/** Typography scale (rem) paired with comfortable line heights. */
export const fontSizes = {
  xs: ['0.75rem', '1rem'],
  sm: ['0.875rem', '1.25rem'],
  base: ['1rem', '1.5rem'],
  lg: ['1.125rem', '1.75rem'],
  xl: ['1.25rem', '1.75rem'],
  '2xl': ['1.5rem', '2rem'],
} as const;

/** The complete token set, convenient for a Tailwind `theme.extend` spread. */
export const tokens = {
  colors,
  spacing,
  radii,
  shadows,
  fontSizes,
} as const;

export type Tokens = typeof tokens;
