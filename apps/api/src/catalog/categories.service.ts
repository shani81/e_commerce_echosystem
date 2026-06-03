import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Category } from '@aicos/db';
import { slugify } from '@aicos/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';

type CategoryRow = Category;

/** A category plus its nested children — the shape returned by `?tree=true`. */
export interface CategoryNode extends CategoryRow {
  children: CategoryNode[];
}

/**
 * Tenant-scoped CRUD over categories, including the self-referential parent
 * tree. All DB access runs through `prisma.forTenant(tenantId, ...)`; soft
 * deletes are honoured via `deletedAt`.
 */
@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);
    if (dto.parentId) await this.assertParentExists(tenantId, dto.parentId);
    try {
      return await this.prisma.forTenant(tenantId, (tx) =>
        tx.category.create({
          data: {
            tenantId,
            name: dto.name,
            slug,
            parentId: dto.parentId ?? null,
            description: dto.description ?? null,
            imageUrl: dto.imageUrl ?? null,
            position: dto.position ?? 0,
          },
        }),
      );
    } catch (err) {
      throw this.mapUniqueError(err, slug);
    }
  }

  /** Flat list of (non-deleted) categories, ordered by position then name. */
  async list(tenantId: string) {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.category.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      }),
    );
  }

  /** Nested tree built from the self-referential parent field (roots first). */
  async tree(tenantId: string): Promise<CategoryNode[]> {
    const rows = await this.list(tenantId);
    const byId = new Map<string, CategoryNode>();
    for (const row of rows) byId.set(row.id, { ...row, children: [] });

    const roots: CategoryNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async findOne(tenantId: string, id: string) {
    const category = await this.prisma.forTenant(tenantId, (tx) =>
      tx.category.findFirst({ where: { id, tenantId, deletedAt: null } }),
    );
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    await this.findOne(tenantId, id);
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw new BadRequestException('A category cannot be its own parent');
      }
      await this.assertParentExists(tenantId, dto.parentId);
    }

    const data: Prisma.CategoryUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId
        ? { connect: { id: dto.parentId } }
        : { disconnect: true };
    }

    try {
      return await this.prisma.forTenant(tenantId, (tx) =>
        tx.category.update({ where: { id }, data }),
      );
    } catch (err) {
      throw this.mapUniqueError(err, dto.slug);
    }
  }

  /** Soft-delete (sets `deletedAt`). */
  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await this.prisma.forTenant(tenantId, (tx) =>
      tx.category.update({ where: { id }, data: { deletedAt: new Date() } }),
    );
    return { id, deleted: true };
  }

  private async assertParentExists(tenantId: string, parentId: string) {
    const parent = await this.prisma.forTenant(tenantId, (tx) =>
      tx.category.findFirst({
        where: { id: parentId, tenantId, deletedAt: null },
      }),
    );
    if (!parent) throw new BadRequestException('Parent category not found');
  }

  private mapUniqueError(err: unknown, slug?: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(
        `Category with slug "${slug ?? ''}" already exists`,
      );
    }
    return err;
  }
}
