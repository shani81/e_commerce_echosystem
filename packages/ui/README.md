# @aicos/ui

The AICOS design-system base: a small set of accessible React 19 primitives plus the shared design tokens. **Source-only** — this package ships its `.tsx` files and has **no build step**. `main` and `types` point at `src/index.ts`, and consuming Next.js apps transpile it via `transpilePackages: ["@aicos/ui", "@aicos/types"]`.

## Why source-only

Shipping source (rather than a compiled `dist`) keeps the design system trivially debuggable in app code, lets each app's Tailwind/PostCSS pipeline see the component classes for tree-shaking and JIT, and removes a build hop from the monorepo. Apps are responsible for transpilation.

## Usage

```tsx
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, cn } from '@aicos/ui';

export function Example() {
  return (
    <Card variant="elevated" padding="lg">
      <CardHeader>
        <CardTitle>Order #1024</CardTitle>
      </CardHeader>
      <CardContent className="mt-2 flex items-center gap-2">
        <Badge variant="success">Paid</Badge>
        <Button size="sm" variant="outline">View</Button>
      </CardContent>
    </Card>
  );
}
```

## `cn()`

`cn(...inputs)` composes class names with `clsx` and then resolves conflicting Tailwind utilities with `tailwind-merge`, so caller overrides reliably win:

```ts
cn('px-4 py-2 bg-brand-600', isCompact && 'py-1'); // py-1 wins over py-2
```

## Design tokens

`src/tokens.ts` exports `tokens` (and the individual `colors`, `spacing`, `radii`, `shadows`, `fontSizes`). Apps map these onto their Tailwind theme so utilities such as `bg-brand-600` and `text-neutral-500` resolve. Example `tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';
import { colors, radii, spacing } from '@aicos/ui/src/tokens';

export default {
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: { brand: colors.brand, neutral: colors.neutral },
      borderRadius: radii,
      spacing,
    },
  },
} satisfies Config;
```

> Remember to include `../../packages/ui/src/**/*.{ts,tsx}` in your app's Tailwind `content` globs so the component classes are generated.

## Components

| Component | Notes |
|-----------|-------|
| `Button` | `variant` (`primary` \| `secondary` \| `outline` \| `ghost` \| `danger`), `size`, `fullWidth`, `isLoading`. Renders a native `<button>`, defaults `type="button"`, sets `aria-busy`/`aria-disabled`. |
| `Badge` | `variant`, `size`. Inline status pill. |
| `Card` + `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter` | Composable surface. `CardTitle` renders a real heading (`as` prop) for a correct document outline. |

All components are typed, forward their `ref`, spread native attributes, and expose variants through `cn()`.

## Scripts

| Script | Action |
|--------|--------|
| `pnpm --filter @aicos/ui lint` | ESLint over `src` |
| `pnpm --filter @aicos/ui typecheck` | `tsc --noEmit` |
