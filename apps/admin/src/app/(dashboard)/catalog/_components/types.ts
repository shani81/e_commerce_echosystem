import type { BadgeVariant } from '@aicos/ui';

/** ProductStatus enum values (from packages/db/prisma/schema.prisma). */
export type ProductStatus = 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'ARCHIVED';

export const PRODUCT_STATUSES: ProductStatus[] = [
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'ARCHIVED',
];

/** ProductType enum values (from the schema). */
export type ProductType = 'PHYSICAL' | 'DIGITAL' | 'SERVICE' | 'GIFT_CARD';

export const STATUS_BADGE: Record<ProductStatus, BadgeVariant> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  PENDING_REVIEW: 'warning',
  ARCHIVED: 'neutral',
};

export const STATUS_LABEL: Record<ProductStatus, string> = {
  ACTIVE: 'Active',
  DRAFT: 'Draft',
  PENDING_REVIEW: 'Pending review',
  ARCHIVED: 'Archived',
};

export interface Variant {
  id: string;
  productId: string;
  title: string;
  sku: string | null;
  priceCents: number;
  options: Record<string, unknown> | null;
}

export interface ProductImage {
  id: string;
  mediaId: string;
  altText: string | null;
  isPrimary: boolean;
}

export interface Product {
  id: string;
  title: string;
  description: string | null;
  brandId: string | null;
  status: ProductStatus;
  type: ProductType;
  updatedAt: string;
  variants?: Variant[];
  images?: ProductImage[];
}

export interface Brand {
  id: string;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

/** Money is stored as integer cents. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Lowest variant price for a product, or null when no priced variants exist. */
export function minVariantPriceCents(variants?: Variant[]): number | null {
  if (!variants || variants.length === 0) return null;
  return variants.reduce<number>(
    (min, v) => (v.priceCents < min ? v.priceCents : min),
    Number.POSITIVE_INFINITY,
  );
}

/** Format the options JSON map as "key: value" pairs. */
export function formatOptions(options: Record<string, unknown> | null | undefined): string {
  if (!options || typeof options !== 'object') return '—';
  const entries = Object.entries(options);
  if (entries.length === 0) return '—';
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join(', ');
}
