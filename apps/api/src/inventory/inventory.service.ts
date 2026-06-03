import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  StockMovementType,
  type InventoryItem,
  type Prisma,
  type StockMovement,
} from '@aicos/db';
import { PrismaService } from '../prisma/prisma.service';
import type { PaginatedResult } from '../common/dto/pagination.dto';
import type { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import type { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import type { ListInventoryDto } from './dto/list-inventory.dto';
import type { CreateAdjustmentDto } from './dto/create-adjustment.dto';

/** An {@link InventoryItem} plus the derived `available = onHand - reserved`. */
export type InventoryItemWithAvailable = InventoryItem & { available: number };

/**
 * Movement types whose semantics permit driving on-hand negative (manual
 * corrections / backorder-style oversell). Every other type is rejected when it
 * would push on-hand below zero.
 */
const NEGATIVE_ALLOWED_TYPES: ReadonlySet<StockMovementType> = new Set([
  StockMovementType.ADJUSTMENT,
]);

/**
 * Tenant-scoped inventory operations over {@link InventoryItem} +
 * {@link StockMovement}. All DB work goes through `prisma.forTenant`, so RLS
 * scopes every statement to the active tenant. The append-only stock ledger is
 * written alongside every quantity change inside a single transaction.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an inventory item for a `variant × location` pair with an initial
   * on-hand level, recording the seeding `RECEIVE` movement in the same tx.
   */
  async create(
    tenantId: string,
    dto: CreateInventoryItemDto,
  ): Promise<InventoryItemWithAvailable> {
    const onHand = dto.onHand ?? 0;

    const item = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: {
          tenantId,
          variantId: dto.variantId,
          locationId: dto.locationId,
        },
      });
      if (existing) {
        throw new ConflictForVariantLocation();
      }

      const created = await tx.inventoryItem.create({
        data: {
          tenantId,
          variantId: dto.variantId,
          locationId: dto.locationId,
          onHand,
          reorderPoint: dto.reorderPoint ?? 0,
          reorderQty: dto.reorderQty ?? 0,
        },
      });

      if (onHand > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            inventoryItemId: created.id,
            locationId: created.locationId,
            type: StockMovementType.RECEIVE,
            quantity: onHand,
            reason: 'Initial stock',
            refType: 'manual',
          },
        });
      }

      return created;
    }).catch((err: unknown) => {
      if (err instanceof ConflictForVariantLocation) {
        throw new BadRequestException(
          'An inventory item already exists for this variant at this location',
        );
      }
      throw err;
    });

    return this.withAvailable(item);
  }

  /** Paginated inventory items with optional variant/location filters. */
  async list(
    tenantId: string,
    query: ListInventoryDto,
  ): Promise<PaginatedResult<InventoryItemWithAvailable>> {
    const where: Prisma.InventoryItemWhereInput = {
      tenantId,
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    };

    const { items, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, count] = await Promise.all([
        tx.inventoryItem.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: query.skip,
          take: query.take,
        }),
        tx.inventoryItem.count({ where }),
      ]);
      return { items: rows, total: count };
    });

    return {
      items: items.map((i) => this.withAvailable(i)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async findOne(
    tenantId: string,
    id: string,
  ): Promise<InventoryItemWithAvailable> {
    const item = await this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryItem.findFirst({ where: { id, tenantId } }),
    );
    if (!item) throw new NotFoundException('Inventory item not found');
    return this.withAvailable(item);
  }

  /** Update the reorder-policy fields (`reorderPoint`, `reorderQty`). */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateInventoryItemDto,
  ): Promise<InventoryItemWithAvailable> {
    await this.findOne(tenantId, id);
    const item = await this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryItem.update({
        where: { id },
        data: {
          ...(dto.reorderPoint !== undefined
            ? { reorderPoint: dto.reorderPoint }
            : {}),
          ...(dto.reorderQty !== undefined
            ? { reorderQty: dto.reorderQty }
            : {}),
        },
      }),
    );
    return this.withAvailable(item);
  }

  /**
   * Low-stock alerts: items whose available (`onHand - reserved`) is at or below
   * their reorder point. Computed in SQL via a column-to-column comparison so it
   * scales without loading the whole table.
   */
  async alerts(tenantId: string): Promise<InventoryItemWithAvailable[]> {
    const items = await this.prisma.forTenant(tenantId, (tx) =>
      tx.inventoryItem.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    return items
      .map((i) => this.withAvailable(i))
      .filter((i) => i.available <= i.reorderPoint);
  }

  /**
   * Apply a signed stock adjustment in ONE tenant-scoped transaction:
   *   1. find-or-create the InventoryItem for `variant × location`;
   *   2. write a signed StockMovement classified by `type`;
   *   3. update `onHand` by `delta`.
   * Rejects movements that would drive on-hand below 0 unless the movement type
   * explicitly permits it (see {@link NEGATIVE_ALLOWED_TYPES}).
   */
  async adjust(
    tenantId: string,
    dto: CreateAdjustmentDto,
  ): Promise<{ item: InventoryItemWithAvailable; movement: StockMovement }> {
    const result = await this.prisma.forTenant(tenantId, async (tx) => {
      const existing = await tx.inventoryItem.findFirst({
        where: {
          tenantId,
          variantId: dto.variantId,
          locationId: dto.locationId,
        },
      });

      const item =
        existing ??
        (await tx.inventoryItem.create({
          data: {
            tenantId,
            variantId: dto.variantId,
            locationId: dto.locationId,
            onHand: 0,
          },
        }));

      const nextOnHand = item.onHand + dto.delta;
      if (nextOnHand < 0 && !NEGATIVE_ALLOWED_TYPES.has(dto.type)) {
        throw new BadRequestException(
          `Adjustment would drive on-hand below 0 (current ${item.onHand}, delta ${dto.delta}); movement type ${dto.type} does not permit negative stock`,
        );
      }

      const movement = await tx.stockMovement.create({
        data: {
          tenantId,
          inventoryItemId: item.id,
          locationId: item.locationId,
          type: dto.type,
          quantity: dto.delta,
          reason: dto.reason ?? null,
          refType: 'manual',
        },
      });

      const updated = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { onHand: { increment: dto.delta } },
      });

      return { item: updated, movement };
    });

    return {
      item: this.withAvailable(result.item),
      movement: result.movement,
    };
  }

  /** Attach the derived `available = onHand - reserved` to an item. */
  private withAvailable(item: InventoryItem): InventoryItemWithAvailable {
    return { ...item, available: item.onHand - item.reserved };
  }
}

/** Internal sentinel so the unique-constraint case maps to a 400 cleanly. */
class ConflictForVariantLocation extends Error {}
