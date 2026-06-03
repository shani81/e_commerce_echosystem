import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus, type Product } from '@aicos/db';
import { skuFromTitle, slugify } from '@aicos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SearchIndexerService } from '../search/search-indexer.service';
import type { PaginatedResult } from '../common/dto/pagination.dto';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { ListProductsDto } from './dto/list-products.dto';
import type { CreateVariantDto } from './dto/create-variant.dto';
import type { UpdateVariantDto } from './dto/update-variant.dto';
import type { CreateProductImageDto } from './dto/create-product-image.dto';

/**
 * Tenant-scoped CRUD for products and their variants/images. Every query runs
 * inside `prisma.forTenant(tenantId, ...)` so PostgreSQL RLS scopes the rows;
 * CREATE writes `tenantId` to satisfy the RLS WITH CHECK clause. Products and
 * variants soft-delete via `deletedAt`.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indexer: SearchIndexerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  async create(tenantId: string, dto: CreateProductDto) {
    const slug = dto.slug ?? slugify(dto.title);
    try {
      const product = await this.prisma.forTenant(tenantId, (tx) =>
        tx.product.create({
          data: {
            tenantId,
            title: dto.title,
            slug,
            description: dto.description ?? null,
            type: dto.type,
            status: dto.status,
            storeId: dto.storeId ?? null,
            brandId: dto.brandId ?? null,
            seoTitle: dto.seoTitle ?? null,
            seoDescription: dto.seoDescription ?? null,
            searchKeywords: dto.searchKeywords ?? null,
          },
        }),
      );
      await this.indexer.syncProduct(tenantId, product.id);
      return product;
    } catch (err) {
      throw this.mapProductSlugConflict(err, slug);
    }
  }

  async list(
    tenantId: string,
    query: ListProductsDto,
  ): Promise<PaginatedResult<Product>> {
    const where: Prisma.ProductWhereInput = {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { title: { contains: query.q, mode: 'insensitive' } }
        : {}),
      ...(query.categoryId
        ? { categories: { some: { categoryId: query.categoryId } } }
        : {}),
    };

    const { items, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, count] = await Promise.all([
        tx.product.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        tx.product.count({ where }),
      ]);
      return { items: rows, total: count };
    });

    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  /** Single product including its (non-deleted) variants and images. */
  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.forTenant(tenantId, (tx) =>
      tx.product.findFirst({
        where: { id, tenantId, deletedAt: null },
        include: {
          variants: {
            where: { deletedAt: null },
            orderBy: { position: 'asc' },
          },
          images: { orderBy: { position: 'asc' } },
        },
      }),
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.assertProductExists(tenantId, id);
    const data: Prisma.ProductUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.seoTitle !== undefined) data.seoTitle = dto.seoTitle;
    if (dto.seoDescription !== undefined) {
      data.seoDescription = dto.seoDescription;
    }
    if (dto.searchKeywords !== undefined) {
      data.searchKeywords = dto.searchKeywords;
    }
    if (dto.brandId !== undefined) {
      data.brand = dto.brandId
        ? { connect: { id: dto.brandId } }
        : { disconnect: true };
    }
    if (dto.storeId !== undefined) {
      data.store = dto.storeId
        ? { connect: { id: dto.storeId } }
        : { disconnect: true };
    }

    try {
      const product = await this.prisma.forTenant(tenantId, (tx) =>
        tx.product.update({ where: { id }, data }),
      );
      await this.indexer.syncProduct(tenantId, id);
      return product;
    } catch (err) {
      throw this.mapProductSlugConflict(err, dto.slug);
    }
  }

  /** Soft-delete (sets `deletedAt`). */
  async remove(tenantId: string, id: string) {
    await this.assertProductExists(tenantId, id);
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.product.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
    await this.indexer.removeProduct(id);
    return { id, deleted: true };
  }

  /** Publish: move status to ACTIVE (the schema's sellable/published value). */
  async publish(tenantId: string, id: string) {
    await this.assertProductExists(tenantId, id);
    const product = await this.prisma.forTenant(tenantId, (tx) =>
      tx.product.update({
        where: { id },
        data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
      }),
    );
    await this.indexer.syncProduct(tenantId, id);
    return product;
  }

  // ---------------------------------------------------------------------------
  // Variants
  // ---------------------------------------------------------------------------

  async createVariant(
    tenantId: string,
    productId: string,
    dto: CreateVariantDto,
  ) {
    const product = await this.assertProductExists(tenantId, productId);
    const sku = dto.sku ?? skuFromTitle(product.title, [dto.title]);
    try {
      const variant = await this.prisma.forTenant(tenantId, (tx) =>
        tx.productVariant.create({
          data: {
            tenantId,
            productId,
            title: dto.title,
            sku,
            barcode: dto.barcode ?? null,
            options: (dto.options ?? {}) as Prisma.InputJsonValue,
            priceCents: dto.priceCents ?? 0,
            compareAtCents: dto.compareAtCents ?? null,
            costCents: dto.costCents ?? null,
            currency: dto.currency,
            weightUnit: dto.weightUnit,
            inventoryPolicy: dto.inventoryPolicy,
            taxable: dto.taxable,
            position: dto.position ?? 0,
          },
        }),
      );
      await this.indexer.syncProduct(tenantId, productId);
      return variant;
    } catch (err) {
      throw this.mapVariantSkuConflict(err, sku);
    }
  }

  async updateVariant(tenantId: string, id: string, dto: UpdateVariantDto) {
    const existing = await this.assertVariantExists(tenantId, id);
    const data: Prisma.ProductVariantUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.sku !== undefined) data.sku = dto.sku;
    if (dto.barcode !== undefined) data.barcode = dto.barcode;
    if (dto.options !== undefined) {
      data.options = dto.options as Prisma.InputJsonValue;
    }
    if (dto.priceCents !== undefined) data.priceCents = dto.priceCents;
    if (dto.compareAtCents !== undefined) {
      data.compareAtCents = dto.compareAtCents;
    }
    if (dto.costCents !== undefined) data.costCents = dto.costCents;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.weightUnit !== undefined) data.weightUnit = dto.weightUnit;
    if (dto.inventoryPolicy !== undefined) {
      data.inventoryPolicy = dto.inventoryPolicy;
    }
    if (dto.taxable !== undefined) data.taxable = dto.taxable;
    if (dto.position !== undefined) data.position = dto.position;

    try {
      const variant = await this.prisma.forTenant(tenantId, (tx) =>
        tx.productVariant.update({ where: { id }, data }),
      );
      await this.indexer.syncProduct(tenantId, existing.productId);
      return variant;
    } catch (err) {
      throw this.mapVariantSkuConflict(err, dto.sku);
    }
  }

  /** Soft-delete a variant (sets `deletedAt`). */
  async removeVariant(tenantId: string, id: string) {
    const existing = await this.assertVariantExists(tenantId, id);
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.productVariant.update({
        where: { id },
        data: { deletedAt: new Date() },
      }),
    );
    await this.indexer.syncProduct(tenantId, existing.productId);
    return { id, deleted: true };
  }

  // ---------------------------------------------------------------------------
  // Images
  // ---------------------------------------------------------------------------

  /** Attach an existing MediaAsset to a product as a ProductImage. */
  async addImage(
    tenantId: string,
    productId: string,
    dto: CreateProductImageDto,
  ) {
    await this.assertProductExists(tenantId, productId);
    return this.prisma.forTenant(tenantId, async (tx) => {
      const media = await tx.mediaAsset.findFirst({
        where: { id: dto.mediaAssetId, tenantId },
      });
      if (!media) throw new NotFoundException('Media asset not found');

      const image = await tx.productImage.create({
        data: {
          tenantId,
          productId,
          mediaId: dto.mediaAssetId,
          position: dto.position ?? 0,
          altText: dto.altText ?? null,
          isPrimary: dto.isPrimary ?? false,
        },
      });

      if (dto.isPrimary) {
        await tx.product.update({
          where: { id: productId },
          data: { primaryImageId: image.id },
        });
      }
      return image;
    });
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async assertProductExists(tenantId: string, id: string) {
    const product = await this.prisma.forTenant(tenantId, (tx) =>
      tx.product.findFirst({ where: { id, tenantId, deletedAt: null } }),
    );
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertVariantExists(tenantId: string, id: string) {
    const variant = await this.prisma.forTenant(tenantId, (tx) =>
      tx.productVariant.findFirst({
        where: { id, tenantId, deletedAt: null },
      }),
    );
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  private mapProductSlugConflict(err: unknown, slug?: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        `Product with slug "${slug ?? ''}" already exists`,
      );
    }
    return err;
  }

  private mapVariantSkuConflict(err: unknown, sku?: string | null): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        `Variant with sku "${sku ?? ''}" already exists`,
      );
    }
    return err;
  }
}
