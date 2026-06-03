import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@aicos/db';
import { slugify } from '@aicos/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBrandDto } from './dto/create-brand.dto';
import type { UpdateBrandDto } from './dto/update-brand.dto';

/**
 * Tenant-scoped CRUD over brands. All DB access runs through
 * `prisma.forTenant(tenantId, ...)` so PostgreSQL RLS scopes every row, and
 * CREATE sets `tenantId` explicitly to satisfy the RLS WITH CHECK clause.
 */
@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateBrandDto) {
    const slug = dto.slug ?? slugify(dto.name);
    try {
      return await this.prisma.forTenant(tenantId, (tx) =>
        tx.brand.create({
          data: {
            tenantId,
            name: dto.name,
            slug,
            logoUrl: dto.logoUrl ?? null,
          },
        }),
      );
    } catch (err) {
      throw this.mapUniqueError(err, slug);
    }
  }

  async list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.brand.findMany({
        where: { tenantId },
        orderBy: { name: 'asc' },
      }),
    );
  }

  async findOne(tenantId: string, id: string) {
    const brand = await this.prisma.forTenant(tenantId, (tx) =>
      tx.brand.findFirst({ where: { id, tenantId } }),
    );
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async update(tenantId: string, id: string, dto: UpdateBrandDto) {
    await this.findOne(tenantId, id);
    const data: Prisma.BrandUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.logoUrl !== undefined) data.logoUrl = dto.logoUrl;
    try {
      return await this.prisma.forTenant(tenantId, (tx) =>
        tx.brand.update({ where: { id }, data }),
      );
    } catch (err) {
      throw this.mapUniqueError(err, dto.slug);
    }
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.brand.delete({ where: { id } }),
    );
    return { id, deleted: true };
  }

  private mapUniqueError(err: unknown, slug?: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        `Brand with slug "${slug ?? ''}" already exists`,
      );
    }
    return err;
  }
}
