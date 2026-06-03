import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Compose Tailwind class names.
 *
 * `clsx` resolves conditional/array/object inputs into a single string, then
 * `tailwind-merge` deduplicates conflicting Tailwind utilities so the last one
 * wins (e.g. `cn('p-2', 'p-4')` → `'p-4'`). Use this for every component's
 * `className` so variants and caller overrides compose predictably.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
