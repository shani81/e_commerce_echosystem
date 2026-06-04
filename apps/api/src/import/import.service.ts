import { Injectable, Logger } from '@nestjs/common';
import { ProductStatus, ProductType } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import { csvToImportRows, slugify, type ImportRow } from './csv.util';
import type { ImportProductsDto } from './dto/import-products.dto';

export interface ImportSummary {
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Product importer. Accepts a JSON array or a CSV/WooCommerce export and creates
 * DRAFT products (+ a default variant), upserting brands by name. Rows whose
 * slug already exists are skipped (idempotent re-import). Imported products land
 * as DRAFT so the merchant reviews + publishes them (publish drives search index).
 * Parsing/field-mapping lives in `csv.util` (unit-tested in isolation).
 */
@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async importProducts(tenantId: string, dto: ImportProductsDto): Promise<ImportSummary> {
    const rows = this.toRows(dto);
    const summary: ImportSummary = { created: 0, skipped: 0, errors: [] };
    for (const row of rows) {
      try {
        const created = await this.importRow(tenantId, row);
        if (created) summary.created++;
        else summary.skipped++;
      } catch (err) {
        summary.errors.push(`${row.title}: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    this.logger.log(
      `import: ${summary.created} created, ${summary.skipped} skipped, ${summary.errors.length} errors`,
    );
    return summary;
  }

  private toRows(dto: ImportProductsDto): ImportRow[] {
    if (dto.products?.length) {
      return dto.products
        .filter((p) => p.title?.trim())
        .map((p) => ({
          title: p.title.trim(),
          sku: p.sku?.trim() || undefined,
          priceCents: p.priceCents ?? 0,
          description: p.description?.trim() || undefined,
          brand: p.brand?.trim() || undefined,
        }));
    }
    if (dto.csv?.trim()) return csvToImportRows(dto.csv);
    return [];
  }

  private importRow(tenantId: string, row: ImportRow): Promise<boolean> {
    const slug = slugify(row.title);
    return this.prisma.forTenant(tenantId, async (tx) => {
      const exists = await tx.product.findFirst({
        where: { tenantId, slug },
        select: { id: true },
      });
      if (exists) return false;

      let brandId: string | null = null;
      if (row.brand) {
        const existingBrand = await tx.brand.findFirst({
          where: { tenantId, name: row.brand },
          select: { id: true },
        });
        brandId =
          existingBrand?.id ??
          (
            await tx.brand.create({
              data: { tenantId, name: row.brand, slug: slugify(row.brand) },
              select: { id: true },
            })
          ).id;
      }

      const product = await tx.product.create({
        data: {
          tenantId,
          title: row.title,
          slug,
          type: ProductType.PHYSICAL,
          status: ProductStatus.DRAFT,
          description: row.description ?? null,
          brandId,
        },
        select: { id: true },
      });
      await tx.productVariant.create({
        data: {
          tenantId,
          productId: product.id,
          title: 'Default',
          sku: row.sku ?? null,
          priceCents: row.priceCents,
        },
      });
      return true;
    });
  }
}
