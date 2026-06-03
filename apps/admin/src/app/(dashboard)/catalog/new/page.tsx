'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card } from '@aicos/ui';
import { Field, Input, Textarea, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/ui/page-header';
import { apiGet, apiPost, ApiError, type Paginated } from '@/lib/api';
import { CatalogTabs } from '../_components/catalog-tabs';
import {
  PRODUCT_STATUSES,
  STATUS_LABEL,
  type Brand,
  type Product,
  type ProductStatus,
} from '../_components/types';

export default function NewProductPage() {
  const router = useRouter();

  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [brandsError, setBrandsError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [brandId, setBrandId] = React.useState('');
  const [status, setStatus] = React.useState<ProductStatus>('DRAFT');

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    apiGet<Paginated<Brand>>('/brands?page=1&pageSize=100')
      .then((res) => {
        if (!cancelled) setBrands(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setBrandsError(err instanceof ApiError ? err.message : 'Failed to load brands.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    const trimmed = title.trim();
    if (!trimmed) {
      setFieldError('Title is required.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await apiPost<Product>('/products', {
        title: trimmed,
        description: description.trim() || undefined,
        brandId: brandId || undefined,
        status,
      });
      router.push(`/catalog/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create product.');
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New product"
        description="Create a product draft. You can add variants after saving."
        action={
          <Link href="/catalog">
            <Button variant="outline">Back to products</Button>
          </Link>
        }
      />

      <CatalogTabs />

      <Card variant="outline" padding="lg">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <Field label="Title" htmlFor="title" required error={fieldError ?? undefined}>
            <Input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Aurora Wireless Headphones"
            />
          </Field>

          <Field label="Description" htmlFor="description">
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional long-form description."
            />
          </Field>

          <Field
            label="Brand"
            htmlFor="brandId"
            error={brandsError ?? undefined}
            hint="Optional."
          >
            <Select id="brandId" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" isLoading={submitting}>
              {submitting ? 'Creating…' : 'Create product'}
            </Button>
            <Link href="/catalog">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
