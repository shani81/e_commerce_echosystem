import { Injectable, NotFoundException } from '@nestjs/common';
import type { InventoryLocation, Prisma } from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type {
  PaginatedResult,
  PaginationDto,
} from '../common/dto/pagination.dto';
import type { CreateLocationDto } from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

/**
 * Tenant-scoped CRUD for {@link InventoryLocation}. Every query runs through
 * `prisma.forTenant(tenantId, ...)` so PostgreSQL RLS guarantees rows from other
 * tenants are never touched. The model has no `deletedAt`, so DELETE is a hard
 * delete (the DB FK from inventory items will reject removing a non-empty
 * location).
 */
@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    dto: CreateLocationDto,
  ): Promise<InventoryLocation> {
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryLocation.create({
        data: {
          tenantId,
          name: dto.name,
          isDefault: dto.isDefault ?? false,
          addressId: dto.addressId ?? null,
        },
      }),
    );
  }

  async list(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<InventoryLocation>> {
    const where: Prisma.InventoryLocationWhereInput = { tenantId };
    const { items, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, count] = await Promise.all([
        tx.inventoryLocation.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          skip: pagination.skip,
          take: pagination.take,
        }),
        tx.inventoryLocation.count({ where }),
      ]);
      return { items: rows, total: count };
    });

    return {
      items,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  async findOne(tenantId: string, id: string): Promise<InventoryLocation> {
    const location = await this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryLocation.findFirst({ where: { id, tenantId } }),
    );
    if (!location) throw new NotFoundException('Inventory location not found');
    return location;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateLocationDto,
  ): Promise<InventoryLocation> {
    // Ensure it exists within the tenant before issuing the update.
    await this.findOne(tenantId, id);
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryLocation.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.addressId !== undefined ? { addressId: dto.addressId } : {}),
        },
      }),
    );
  }

  async remove(tenantId: string, id: string): Promise<InventoryLocation> {
    await this.findOne(tenantId, id);
    return this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryLocation.delete({ where: { id } }),
    );
  }
}
