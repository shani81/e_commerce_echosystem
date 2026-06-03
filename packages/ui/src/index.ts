// @aicos/ui — design-system base. Source-only (no build step); consuming Next.js
// apps transpile these .tsx files via `transpilePackages`.

export { cn } from './lib/cn';
export * from './tokens';

export { Button } from './components/button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './components/button';

export { Badge } from './components/badge';
export type { BadgeProps, BadgeVariant, BadgeSize } from './components/badge';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/card';
export type {
  CardProps,
  CardVariant,
  CardPadding,
  CardSectionProps,
  CardTitleProps,
} from './components/card';
