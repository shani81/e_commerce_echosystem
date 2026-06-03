import type { Config } from 'tailwindcss';
// Import tokens from the tokens module directly (NOT the @aicos/ui barrel) so the
// Tailwind config — evaluated by Node, not the Next/webpack TSX pipeline — never
// has to resolve the package's .tsx React components.
import { colors, radii, shadows } from '../../packages/ui/src/tokens';

/**
 * Tailwind config for the AICOS storefront.
 *
 * The `content` globs include `packages/ui/src` so the design-system component
 * classes (e.g. `bg-brand-600`) survive purge. The theme maps the shared design
 * tokens from `@aicos/ui` onto Tailwind's scale, so utilities like `bg-brand-600`,
 * `text-neutral-500`, `rounded-xl`, and `shadow-md` resolve identically in the
 * app and inside the design-system components it renders.
 */
const config: Config = {
  content: [
    './src/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        neutral: colors.neutral,
        success: colors.success,
        warning: colors.warning,
        danger: colors.danger,
        info: colors.info,
      },
      borderRadius: {
        sm: radii.sm,
        md: radii.md,
        lg: radii.lg,
        xl: radii.xl,
        '2xl': radii['2xl'],
      },
      boxShadow: {
        sm: shadows.sm,
        md: shadows.md,
        lg: shadows.lg,
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: '72rem',
      },
    },
  },
  plugins: [],
};

export default config;
