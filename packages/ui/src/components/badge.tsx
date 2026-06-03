import * as React from 'react';
import { cn } from '../lib/cn';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

const base =
  'inline-flex items-center gap-1 rounded-full border font-medium leading-none whitespace-nowrap';

const variants: Record<BadgeVariant, string> = {
  neutral: 'border-neutral-200 bg-neutral-100 text-neutral-700',
  brand: 'border-brand-200 bg-brand-50 text-brand-700',
  success: 'border-green-200 bg-green-50 text-green-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};

const sizes: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic color. @default 'neutral' */
  variant?: BadgeVariant;
  /** @default 'sm' */
  size?: BadgeSize;
}

/**
 * Compact status/label pill. Renders an inline `<span>`; pass a `title` or
 * surrounding text for screen-reader context when the badge is the only signal.
 */
export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className, variant = 'neutral', size = 'sm', children, ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </span>
  );
});
