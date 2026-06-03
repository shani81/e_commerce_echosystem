import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { ListInventoryDto } from './dto/list-inventory.dto';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';

/**
 * Inventory item + adjustment endpoints (→ `/api/v1/inventory`). Guarded by
 * JwtAuthGuard (authn) + RolesGuard (RBAC); reads need `inventory:read`, writes
 * need `inventory:write`. Tenant scope comes from the authenticated principal.
 *
 * NOTE: the literal sub-paths (`/inventory/alerts`, `/inventory/adjustments`)
 * are declared BEFORE `/inventory/:id` so they are matched ahead of the param
 * route.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Permissions(PERMISSIONS.INVENTORY_WRITE)
  @Post('inventory')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.inventory.create(tenantId, dto);
  }

  @Permissions(PERMISSIONS.INVENTORY_WRITE)
  @Post('inventory/adjustments')
  adjust(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.inventory.adjust(tenantId, dto);
  }

  @Permissions(PERMISSIONS.INVENTORY_READ)
  @Get('inventory')
  list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListInventoryDto,
  ) {
    return this.inventory.list(tenantId, query);
  }

  @Permissions(PERMISSIONS.INVENTORY_READ)
  @Get('inventory/alerts')
  alerts(@CurrentTenant() tenantId: string) {
    return this.inventory.alerts(tenantId);
  }

  @Permissions(PERMISSIONS.INVENTORY_READ)
  @Get('inventory/:id')
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.inventory.findOne(tenantId, id);
  }

  @Permissions(PERMISSIONS.INVENTORY_WRITE)
  @Patch('inventory/:id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventory.update(tenantId, id, dto);
  }
}
