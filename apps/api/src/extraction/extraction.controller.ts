import {
  Body,
  Controller,
  Delete,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { PaginationDto } from '../common/dto/pagination.dto';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { ExtractionService } from './extraction.service';
import { CreateExtractionDto } from './dto/create-extraction.dto';
import { AddBarcodeDto } from './dto/add-barcode.dto';

/**
 * AI product-extraction (→ `/api/v1/extractions`). Tenant-scoped + RBAC. Start a
 * job from an uploaded media asset, watch its results, and accept a result into a
 * DRAFT product (the mandatory human review gate).
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('extractions')
export class ExtractionController {
  constructor(private readonly extraction: ExtractionService) {}

  @Post()
  @Permissions(PERMISSIONS.EXTRACTION_WRITE)
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateExtractionDto) {
    return this.extraction.create(tenantId, dto);
  }

  @Get()
  @Permissions(PERMISSIONS.EXTRACTION_READ)
  list(@CurrentTenant() tenantId: string, @Query() query: PaginationDto) {
    return this.extraction.list(tenantId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.EXTRACTION_READ)
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.extraction.findOne(tenantId, id);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.EXTRACTION_WRITE)
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.extraction.remove(tenantId, id);
  }

  @Post(':id/results/barcode')
  @Permissions(PERMISSIONS.EXTRACTION_WRITE)
  addBarcode(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: AddBarcodeDto,
  ) {
    return this.extraction.addBarcodeResult(tenantId, id, dto.barcode);
  }

  @Post('results/:resultId/accept')
  @Permissions(PERMISSIONS.EXTRACTION_WRITE)
  accept(
    @CurrentTenant() tenantId: string,
    @Param('resultId') resultId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.extraction.acceptResult(tenantId, resultId, user.userId);
  }
}
