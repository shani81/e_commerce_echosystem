import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ImportService } from './import.service';
import { ImportProductsDto } from './dto/import-products.dto';

/**
 * Bulk product import (→ `POST /api/v1/imports/products`). Admin-only; accepts a
 * JSON array or a CSV/WooCommerce export and creates DRAFT products.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Post('products')
  @Permissions(PERMISSIONS.IMPORT_WRITE)
  importProducts(@CurrentTenant() tenantId: string, @Body() dto: ImportProductsDto) {
    return this.imports.importProducts(tenantId, dto);
  }
}
