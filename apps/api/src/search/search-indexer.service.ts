import { Injectable, Logger } from '@nestjs/common';
import { MeiliService, type ProductDoc } from './meili.service';
import { PrismaService } from '../prisma/prisma.service';

/** Minimal product shape (with relations) needed to build a search doc. */
interface ProductForIndex {
  id: string;
  tenantId: string;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  type: string;
  brandId: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  brand: { name: string } | null;
  categories: { categoryId: string }[];
  variants: { sku: string | null; priceCents: number }[];
}

const INCLUDE = {
  brand: true,
  categories: true,
  variants: { where: { deletedAt: null } },
};

/**
 * Keeps the Meilisearch products index in step with the catalog. Called
 * best-effort from the catalog service after product/variant mutations (a
 * search outage must never fail a catalog write), plus a full per-tenant
 * reindex endpoint. Production would move this onto the search-sync outbox/queue.
 */
@Injectable()
export class SearchIndexerService {
  private readonly logger = new Logger(SearchIndexerService.name);

  constructor(
    private readonly meili: MeiliService,
    private readonly prisma: PrismaService,
  ) {}

  private toDoc(p: ProductForIndex): ProductDoc {
    const prices = p.variants.map((v) => v.priceCents);
    return {
      id: p.id,
      tenantId: p.tenantId,
      title: p.title,
      slug: p.slug,
      description: p.description ?? '',
      status: p.status,
      type: p.type,
      brandId: p.brandId,
      brandName: p.brand?.name ?? null,
      categoryIds: p.categories.map((c) => c.categoryId),
      skus: p.variants.map((v) => v.sku).filter((s): s is string => Boolean(s)),
      priceMinCents: prices.length ? Math.min(...prices) : null,
      createdAt: p.createdAt.getTime(),
      publishedAt: p.publishedAt ? p.publishedAt.getTime() : null,
    };
  }

  /** Re-index one product; deletes the doc if it's gone or soft-deleted. */
  async syncProduct(tenantId: string, productId: string): Promise<void> {
    const index = this.meili.index();
    if (!index) return;
    try {
      const product = (await this.prisma.forTenant(tenantId, (tx) =>
        tx.product.findFirst({
          where: { id: productId, deletedAt: null },
          include: INCLUDE,
        }),
      )) as unknown as ProductForIndex | null;
      if (!product) {
        await index.deleteDocument(productId);
        return;
      }
      await index.addDocuments([this.toDoc(product)]);
    } catch (err) {
      this.logger.warn(`syncProduct(${productId}) failed: ${(err as Error).message}`);
    }
  }

  async removeProduct(productId: string): Promise<void> {
    const index = this.meili.index();
    if (!index) return;
    try {
      await index.deleteDocument(productId);
    } catch (err) {
      this.logger.warn(`removeProduct(${productId}) failed: ${(err as Error).message}`);
    }
  }

  /** Full reindex of a tenant's products. Returns how many were indexed. */
  async reindexTenant(tenantId: string): Promise<{ indexed: number }> {
    const index = this.meili.index();
    if (!index) return { indexed: 0 };
    const products = (await this.prisma.forTenant(tenantId, (tx) =>
      tx.product.findMany({ where: { deletedAt: null }, include: INCLUDE }),
    )) as unknown as ProductForIndex[];
    if (products.length) {
      await index.addDocuments(products.map((p) => this.toDoc(p)));
    }
    return { indexed: products.length };
  }
}
