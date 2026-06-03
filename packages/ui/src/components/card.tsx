import * as React from 'react';
import { cn } from '../lib/cn';

export type CardVariant = 'elevated' | 'outline' | 'ghost';
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

const variants: Record<CardVariant, string> = {
  elevated: 'border border-neutral-200 bg-white shadow-md',
  outline: 'border border-neutral-200 bg-white',
  ghost: 'border border-transparent bg-transparent',
};

const paddings: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Surface treatment. @default 'elevated' */
  variant?: CardVariant;
  /** Inner padding applied to the root. @default 'md' */
  padding?: CardPadding;
}

/**
 * Surface container. When the card is interactive, pass `role`/`tabIndex` and
 * the relevant handlers; otherwise it is a presentational `<div>`.
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant = 'elevated', padding = 'md', children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl text-neutral-900', variants[variant], paddings[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
});

export type CardSectionProps = React.HTMLAttributes<HTMLDivElement>;

/** Header region. Use with `CardTitle`/`CardDescription` for structure. */
export const CardHeader = React.forwardRef<HTMLDivElement, CardSectionProps>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('flex flex-col gap-1.5', className)} {...props} />;
});

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level for correct document outline. @default 3 */
  as?: 'h1' | 'h2' | 'h3' | 'h4';
}

/** Accessible heading; renders a real heading element so the outline is correct. */
export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(function CardTitle(
  { className, as: Tag = 'h3', ...props },
  ref,
) {
  return (
    <Tag
      ref={ref}
      className={cn('text-base font-semibold leading-tight tracking-tight', className)}
      {...props}
    />
  );
});

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-sm text-neutral-500', className)} {...props} />;
  },
);

/** Main content region. */
export const CardContent = React.forwardRef<HTMLDivElement, CardSectionProps>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('text-sm text-neutral-700', className)} {...props} />;
});

/** Footer region, typically for actions. */
export const CardFooter = React.forwardRef<HTMLDivElement, CardSectionProps>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('flex items-center gap-2 pt-2', className)} {...props} />;
});
