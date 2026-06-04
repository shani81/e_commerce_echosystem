import { Injectable, Logger } from '@nestjs/common';
import { ProductStatus, ProductType } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type { ImportProductsDto } from './dto/import-products.dto';

interface ImportRow {
  title: string;
  sku?: string;
  priceCents: number;
  description?: string;
  brand?: string;
}

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
    if (dto.csv?.trim()) return this.parseCsv(dto.csv);
    return [];
  }

  /** Map a CSV/WooCommerce export to import rows (headers matched loosely). */
  private parseCsv(csv: string): ImportRow[] {
    const table = parseDelimited(csv);
    const headerRow = table[0];
    if (!headerRow || table.length < 2) return [];
    const header = headerRow.map((h) => h.trim().toLowerCase());
    const idx = (...names: string[]): number => {
      for (const n of names) {
        const i = header.indexOf(n);
        if (i !== -1) return i;
      }
      return -1;
    };
    const iTitle = idx('name', 'title', 'product name');
    const iSku = idx('sku');
    const iPrice = idx('regular price', 'price', 'sale price');
    const iDesc = idx('description', 'short description');
    const iBrand = idx('brand', 'brands');

    const rows: ImportRow[] = [];
    for (let r = 1; r < table.length; r++) {
      const cells = table[r];
      if (!cells) continue;
      const title = (iTitle >= 0 ? cells[iTitle] : '')?.trim();
      if (!title) continue;
      rows.push({
        title,
        sku: iSku >= 0 ? cells[iSku]?.trim() || undefined : undefined,
        priceCents: dollarsToCents(iPrice >= 0 ? cells[iPrice] : ''),
        description: iDesc >= 0 ? cells[iDesc]?.trim() || undefined : undefined,
        brand: iBrand >= 0 ? cells[iBrand]?.trim() || undefined : undefined,
      });
    }
    return rows;
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

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
function parseDelimited(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function dollarsToCents(raw: string | undefined): number {
  if (!raw) return 0;
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'item'
  );
}
