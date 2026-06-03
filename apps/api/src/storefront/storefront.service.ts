import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus, StoreStatus } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { MeiliService, type ProductDoc } from '../search/meili.service';

export interface ProductCard {
  id: string;
  title: string;
  slug: string;
  priceMinCents: number | null;
  brandName: string | null;
}

interface DbCardProduct {
  id: string;
  title: string;
  slug: string;
  brand: { name: string } | null;
  variants: { priceCents: number }[];
}

/**
 * Public storefront read model. Resolves a store by its slug to a tenant, then
 * serves only PUBLISHED (status ACTIVE) products — search via Meilisearch when
 * available, falling back to the database otherwise.
 *
 * NOTE (dev): store resolution is by slug. In production a storefront is
 * resolved by its (globally unique) domain/subdomain; slug is unique per tenant.
 */
@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meili: MeiliService,
  ) {}

  private async resolveStore(slug: string): Promise<{
    id: string;
    tenantId: string;
    name: string;
    currency: string;
    slug: string;
  }> {
    // Public + cross-tenant lookup → asSystem (the store table is tenant-scoped).
    const store = await this.prisma.asSystem((tx) =>
      tx.store.findFirst({
        where: { slug, status: StoreStatus.PUBLISHED },
        select: { id: true, tenantId: true, name: true, currency: true, slug: true },
      }),
    );
    if (!store) throw new NotFoundException('Store not found');
    return store;
  }

  async getStore(slug: string) {
    const s = await this.resolveStore(slug);
    return { slug: s.slug, name: s.name, currency: s.currency };
  }

  async listProducts(
    slug: string,
    query: { q?: string; skip: number; take: number; page: number; pageSize: number },
  ): Promise<{ items: ProductCard[]; total: number; page: number; pageSize: number }> {
    const store = await this.resolveStore(slug);

    if (this.meili.enabled) {
      const { hits, total } = await this.meili.search(store.tenantId, query.q ?? '', {
        limit: query.take,
        offset: query.skip,
        statuses: [ProductStatus.ACTIVE],
      });
      return {
        items: hits.map((d: ProductDoc) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
          priceMinCents: d.priceMinCents,
          brandName: d.brandName,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    }

    // Fallback when search is disabled: query the database directly.
    const where = {
      tenantId: store.tenantId,
      status: ProductStatus.ACTIVE,
      deletedAt: null,
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    const { rows, total } = await this.prisma.forTenant(store.tenantId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: { publishedAt: 'desc' },
          skip: query.skip,
          take: query.take,
          include: { brand: true, variants: { where: { deletedAt: null } } },
        }),
        tx.product.count({ where }),
      ]);
      return { rows, total };
    });
    return {
      items: (rows as unknown as DbCardProduct[]).map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        priceMinCents: p.variants.length ? Math.min(...p.variants.map((v) => v.priceCents)) : null,
        brandName: p.brand?.name ?? null,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getProduct(slug: string, productSlug: string) {
    const store = await this.resolveStore(slug);
    const product = await this.prisma.forTenant(store.tenantId, (tx) =>
      tx.product.findFirst({
        where: { slug: productSlug, status: ProductStatus.ACTIVE, deletedAt: null },
        include: {
          brand: true,
          variants: { where: { deletedAt: null }, orderBy: { position: 'asc' } },
          images: { orderBy: { position: 'asc' } },
        },
      }),
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }
}
