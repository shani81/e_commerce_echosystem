'use client';

import * as React from 'react';
import { cn } from '@aicos/ui';

const base =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-900 ' +
  'placeholder:text-neutral-400 focus-visible:border-brand-500 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-brand-500/20 disabled:bg-neutral-50 disabled:text-neutral-400';

/** Labelled wrapper for a form control, with optional hint/error text. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? (
        <label htmlFor={htmlFor} className="text-sm font-medium text-neutral-700">
          {label}
          {required ? <span className="text-danger"> *</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="text-xs text-neutral-400">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(base, 'h-10', className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, 'min-h-[84px] py-2', className)} {...props} />;
});

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(base, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  );
});
