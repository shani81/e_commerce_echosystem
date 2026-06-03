import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

/**
 * Inventory location endpoints (→ `/api/v1/locations`). Guarded by JwtAuthGuard
 * (authn) + RolesGuard (RBAC); reads need `inventory:read`, writes need
 * `inventory:write`. Tenant scope comes from the authenticated principal.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Permissions(PERMISSIONS.INVENTORY_WRITE)
  @Post('locations')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateLocationDto,
  ) {
    return this.locations.create(tenantId, dto);
  }

  @Permissions(PERMISSIONS.INVENTORY_READ)
  @Get('locations')
  list(
    @CurrentTenant() tenantId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.locations.list(tenantId, pagination);
  }

  @Permissions(PERMISSIONS.INVENTORY_READ)
  @Get('locations/:id')
  findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.locations.findOne(tenantId, id);
  }

  @Permissions(PERMISSIONS.INVENTORY_WRITE)
  @Patch('locations/:id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.locations.update(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.INVENTORY_WRITE)
  @Delete('locations/:id')
  remove(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.locations.remove(tenantId, id);
  }
}
