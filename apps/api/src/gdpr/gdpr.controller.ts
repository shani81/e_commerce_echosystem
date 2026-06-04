import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { Public } from '../common/decorators/public.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { GdprService } from './gdpr.service';
import { ListDsarDto } from './dto/list-dsar.dto';
import { CreateDsarDto } from './dto/create-dsar.dto';

/**
 * GDPR / DSAR endpoints. Admin routes (export/erase, request log) are tenant-
 * scoped + RBAC-gated; the public intake route lets a data subject lodge a
 * request from the storefront.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('gdpr')
export class GdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Get('dsar')
  @Permissions(PERMISSIONS.GDPR_READ)
  listRequests(@CurrentTenant() tenantId: string, @Query() query: ListDsarDto) {
    return this.gdpr.listRequests(tenantId, query);
  }

  @Get('customers/:id/export')
  @Permissions(PERMISSIONS.GDPR_READ)
  exportCustomer(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.gdpr.exportCustomer(tenantId, id);
  }

  @Post('customers/:id/erase')
  @Permissions(PERMISSIONS.GDPR_WRITE)
  eraseCustomer(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.gdpr.eraseCustomer(tenantId, id);
  }
}

/**
 * PUBLIC DSAR intake (→ `POST /api/v1/storefront/:storeSlug/gdpr/request`). A
 * shopper requests export or erasure of their data; the worker fulfils it.
 */
@Controller('storefront/:storeSlug/gdpr')
export class PublicGdprController {
  constructor(private readonly gdpr: GdprService) {}

  @Public()
  @Post('request')
  request(@Param('storeSlug') storeSlug: string, @Body() dto: CreateDsarDto) {
    return this.gdpr.createRequestForStore(storeSlug, dto.type, dto.email);
  }
}
