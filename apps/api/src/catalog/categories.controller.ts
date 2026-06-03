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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';

/** Category endpoints (→ `/api/v1/categories`). Tenant-scoped, RBAC `catalog:*`. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('categories')
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.categories.create(tenantId, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('categories')
  list(@CurrentTenant() tenantId: string, @Query() query: ListCategoriesDto) {
    return query.tree === 'true'
      ? this.categories.tree(tenantId)
      : this.categories.list(tenantId);
  }

  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('categories/:id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.categories.findOne(tenantId, id);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Patch('categories/:id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Delete('categories/:id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.categories.remove(tenantId, id);
  }
}
