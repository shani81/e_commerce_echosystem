import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { MeiliService } from './meili.service';
import { SearchIndexerService } from './search-indexer.service';
import { SearchQueryDto } from './dto/search-query.dto';

/**
 * Authenticated, tenant-scoped search admin endpoints (→ `/api/v1/search`).
 * The public storefront search lives in the storefront module.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('search')
export class SearchController {
  constructor(
    private readonly meili: MeiliService,
    private readonly indexer: SearchIndexerService,
  ) {}

  /** Full-text product search across the tenant (all statuses). */
  @Permissions(PERMISSIONS.CATALOG_READ)
  @Get('products')
  async search(@CurrentTenant() tenantId: string, @Query() query: SearchQueryDto) {
    const { hits, total } = await this.meili.search(tenantId, query.q ?? '', {
      limit: query.take,
      offset: query.skip,
    });
    return { items: hits, total, page: query.page, pageSize: query.pageSize };
  }

  /** Rebuild this tenant's search index from the database. */
  @Permissions(PERMISSIONS.CATALOG_WRITE)
  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  reindex(@CurrentTenant() tenantId: string) {
    return this.indexer.reindexTenant(tenantId);
  }

  /** Issue a per-tenant scoped search token for direct client-side search. */
  @Permissions(PERMISSIONS.CATALOG_READ)
  @Post('token')
  @HttpCode(HttpStatus.OK)
  async token(@CurrentTenant() tenantId: string) {
    const token = await this.meili.tenantToken(tenantId);
    return (
      token ?? {
        token: null,
        host: this.meili.hostUrl,
        indexUid: this.meili.indexUid,
        note: 'Tenant-token signing unavailable; use the server-side search endpoint.',
      }
    );
  }
}
