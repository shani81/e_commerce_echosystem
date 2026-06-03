import type { Config } from 'tailwindcss';

/**
 * Tailwind config for the AICOS admin dashboard.
 *
 * The `content` globs include this app's source AND the shared design-system
 * source (`@aicos/ui`), since that package ships raw `.tsx` (no build step) and
 * its utility classes must be discovered by Tailwind's JIT to avoid being purged.
 *
 * The color scales mirror the design tokens exported from `@aicos/ui` (see
 * `packages/ui/src/tokens.ts`) so utilities like `bg-brand-600` and
 * `text-neutral-500` resolve to the same values the design system defines.
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
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
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
        info: '#2563eb',
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgb(2 6 23 / 0.04)',
        md: '0 2px 8px -2px rgb(2 6 23 / 0.08), 0 1px 2px -1px rgb(2 6 23 / 0.06)',
        lg: '0 8px 24px -6px rgb(2 6 23 / 0.10), 0 2px 6px -2px rgb(2 6 23 / 0.06)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
