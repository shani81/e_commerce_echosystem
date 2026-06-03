import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';

/** Brand endpoints (→ `/api/v1/brands`). Tenant-scoped, RBAC `catalog:*`. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('brands')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateBrandDto) {
    return this.brands.create(tenantId, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('brands')
  list(@CurrentTenant() tenantId: string) {
    return this.brands.list(tenantId);
  }

  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('brands/:id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.brands.findOne(tenantId, id);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Patch('brands/:id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateBrandDto,
  ) {
    return this.brands.update(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Delete('brands/:id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.brands.remove(tenantId, id);
  }
}
