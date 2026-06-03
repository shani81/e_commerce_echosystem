'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Button, Badge, Card, CardHeader, CardTitle, CardContent } from '@aicos/ui';
import { Field, Input, Textarea, Select } from '@/components/ui/field';
import { Table, THead, TBody, Tr, Th, Td, EmptyRow } from '@/components/ui/table';
import { PageHeader } from '@/components/ui/page-header';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError, type Paginated } from '@/lib/api';
import { CatalogTabs } from '../_components/catalog-tabs';
import {
  PRODUCT_STATUSES,
  STATUS_BADGE,
  STATUS_LABEL,
  formatCents,
  formatOptions,
  type Brand,
  type Product,
  type ProductStatus,
  type Variant,
} from '../_components/types';

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [product, setProduct] = React.useState<Product | null>(null);
  const [brands, setBrands] = React.useState<Brand[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Edit form fields.
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [brandId, setBrandId] = React.useState('');
  const [status, setStatus] = React.useState<ProductStatus>('DRAFT');

  // Mutation state.
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveOk, setSaveOk] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState<'publish' | 'delete' | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  // Variant inline form.
  const [vTitle, setVTitle] = React.useState('');
  const [vSku, setVSku] = React.useState('');
  const [vPrice, setVPrice] = React.useState('');
  const [vSaving, setVSaving] = React.useState(false);
  const [vError, setVError] = React.useState<string | null>(null);
  const [vBusyId, setVBusyId] = React.useState<string | null>(null);

  const [reloadKey, setReloadKey] = React.useState(0);

  const hydrate = React.useCallback((p: Product) => {
    setProduct(p);
    setTitle(p.title);
    setDescription(p.description ?? '');
    setBrandId(p.brandId ?? '');
    setStatus(p.status);
  }, []);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.all([
      apiGet<Product>(`/products/${id}`),
      apiGet<Paginated<Brand>>('/brands?page=1&pageSize=100'),
    ])
      .then(([p, brandRes]) => {
        if (cancelled) return;
        hydrate(p);
        setBrands(brandRes.items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'Failed to load product.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, hydrate, reloadKey]);

  async function onSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setSaveOk(false);

    const trimmed = title.trim();
    if (!trimmed) {
      setSaveError('Title is required.');
      return;
    }

    setSaving(true);
    try {
      const updated = await apiPatch<Product>(`/products/${id}`, {
        title: trimmed,
        description: description.trim() || null,
        brandId: brandId || null,
        status,
      });
      hydrate(updated);
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2500);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function onPublish() {
    setActionBusy('publish');
    setActionError(null);
    try {
      const updated = await apiPost<Product>(`/products/${id}/publish`);
      hydrate(updated);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not publish product.');
    } finally {
      setActionBusy(null);
    }
  }

  async function onDeleteProduct() {
    if (!product) return;
    if (!window.confirm(`Delete “${product.title}”? This cannot be undone.`)) return;
    setActionBusy('delete');
    setActionError(null);
    try {
      await apiDelete(`/products/${id}`);
      router.push('/catalog');
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete product.');
      setActionBusy(null);
    }
  }

  async function onAddVariant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVError(null);

    const trimmed = vTitle.trim();
    if (!trimmed) {
      setVError('Variant title is required.');
      return;
    }
    const priceCents = vPrice.trim() === '' ? 0 : Math.round(Number(vPrice) * 100);
    if (Number.isNaN(priceCents) || priceCents < 0) {
      setVError('Enter a valid price.');
      return;
    }

    setVSaving(true);
    try {
      await apiPost<Variant>(`/products/${id}/variants`, {
        title: trimmed,
        sku: vSku.trim() || undefined,
        priceCents,
      });
      setVTitle('');
      setVSku('');
      setVPrice('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setVError(err instanceof ApiError ? err.message : 'Could not add variant.');
    } finally {
      setVSaving(false);
    }
  }

  async function onDeleteVariant(variant: Variant) {
    if (!window.confirm(`Delete variant “${variant.title}”?`)) return;
    setVBusyId(variant.id);
    setVError(null);
    try {
      await apiDelete(`/variants/${variant.id}`);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setVError(err instanceof ApiError ? err.message : 'Could not delete variant.');
    } finally {
      setVBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <CatalogTabs />
        <p className="py-12 text-center text-sm text-neutral-400">Loading product…</p>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <CatalogTabs />
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {loadError ?? 'Product not found.'}
        </p>
        <Link href="/catalog">
          <Button variant="outline">Back to products</Button>
        </Link>
      </div>
    );
  }

  const variants = product.variants ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={product.title}
        description="Edit product details and manage variants."
        action={
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_BADGE[product.status]}>{STATUS_LABEL[product.status]}</Badge>
            <Link href="/catalog">
              <Button variant="outline">Back</Button>
            </Link>
          </div>
        }
      />

      <CatalogTabs />

      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {actionError}
        </p>
      ) : null}

      <Card variant="outline" padding="lg">
        <CardHeader className="mb-4">
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="space-y-4" noValidate>
            <Field label="Title" htmlFor="title" required>
              <Input
                id="title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>

            <Field label="Description" htmlFor="description">
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Brand" htmlFor="brandId">
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
            </div>

            {saveError ? (
              <p
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {saveError}
              </p>
            ) : null}
            {saveOk ? (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                Saved.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button type="submit" isLoading={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
              {product.status !== 'ACTIVE' ? (
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={actionBusy === 'publish'}
                  onClick={onPublish}
                >
                  Publish
                </Button>
              ) : null}
              <Button
                type="button"
                variant="danger"
                className="ml-auto"
                isLoading={actionBusy === 'delete'}
                onClick={onDeleteProduct}
              >
                Delete product
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card variant="outline" padding="lg">
        <CardHeader className="mb-4">
          <CardTitle>Variants</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <THead>
              <Tr>
                <Th>Title</Th>
                <Th>SKU</Th>
                <Th className="text-right">Price</Th>
                <Th>Options</Th>
                <Th className="text-right">Actions</Th>
              </Tr>
            </THead>
            <TBody>
              {variants.length === 0 ? (
                <EmptyRow colSpan={5}>No variants yet.</EmptyRow>
              ) : (
                variants.map((variant) => (
                  <Tr key={variant.id}>
                    <Td className="font-medium text-neutral-900">{variant.title}</Td>
                    <Td className="text-neutral-500">{variant.sku || '—'}</Td>
                    <Td className="text-right tabular-nums">{formatCents(variant.priceCents)}</Td>
                    <Td className="text-neutral-500">{formatOptions(variant.options)}</Td>
                    <Td>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-red-50"
                          disabled={vBusyId === variant.id}
                          onClick={() => onDeleteVariant(variant)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>

          <form
            onSubmit={onAddVariant}
            className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4"
            noValidate
          >
            <Field label="Variant title" htmlFor="v-title" required className="min-w-[12rem] flex-1">
              <Input
                id="v-title"
                required
                value={vTitle}
                onChange={(e) => setVTitle(e.target.value)}
                placeholder="e.g. 500ml / Red"
              />
            </Field>
            <Field label="SKU" htmlFor="v-sku" className="w-40">
              <Input
                id="v-sku"
                value={vSku}
                onChange={(e) => setVSku(e.target.value)}
                placeholder="Optional"
              />
            </Field>
            <Field label="Price (USD)" htmlFor="v-price" className="w-32">
              <Input
                id="v-price"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={vPrice}
                onChange={(e) => setVPrice(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            <Button type="submit" isLoading={vSaving}>
              Add variant
            </Button>
            {vError ? (
              <p role="alert" className="w-full text-sm font-medium text-danger">
                {vError}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
