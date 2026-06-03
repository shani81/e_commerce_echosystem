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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { CreateProductImageDto } from './dto/create-product-image.dto';

/**
 * Product / variant / image endpoints (→ `/api/v1/products`, `/api/v1/variants`).
 * Tenant-scoped, RBAC `catalog:read` / `catalog:write`.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('products')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateProductDto) {
    return this.products.create(tenantId, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('products')
  list(@CurrentTenant() tenantId: string, @Query() query: ListProductsDto) {
    return this.products.list(tenantId, query);
  }

  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('products/:id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.products.findOne(tenantId, id);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Patch('products/:id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Delete('products/:id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.products.remove(tenantId, id);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('products/:id/publish')
  publish(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.products.publish(tenantId, id);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('products/:id/variants')
  createVariant(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.products.createVariant(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Patch('variants/:id')
  updateVariant(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.products.updateVariant(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Delete('variants/:id')
  removeVariant(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.products.removeVariant(tenantId, id);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('products/:id/images')
  addImage(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: CreateProductImageDto,
  ) {
    return this.products.addImage(tenantId, id, dto);
  }
}
