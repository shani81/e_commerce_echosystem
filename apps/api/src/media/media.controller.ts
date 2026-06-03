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
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PERMISSIONS } from '../common/rbac/permissions';
import { CreateUploadDto } from './dto/create-upload.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';

/**
 * Media endpoints (→ `/api/v1/media`). Tenant-scoped, RBAC-gated:
 * reads need `media:read`, writes need `media:write`. Uploads are direct-to-S3
 * via presigned URLs; the API only mints rows + URLs and never proxies bytes.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Permissions(PERMISSIONS.MEDIA_WRITE)
  @Post('media/uploads')
  createUpload(
    @CurrentTenant() tenantId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateUploadDto,
  ) {
    return this.media.createUpload(tenantId, dto, userId);
  }

  @Permissions(PERMISSIONS.MEDIA_WRITE)
  @Post('media/:id/confirm')
  confirmUpload(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    return this.media.confirmUpload(tenantId, id, dto);
  }

  @Permissions(PERMISSIONS.MEDIA_READ)
  @Get('media')
  list(
    @CurrentTenant() tenantId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.media.list(tenantId, pagination);
  }

  @Permissions(PERMISSIONS.MEDIA_READ)
  @Get('media/:id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.media.findOne(tenantId, id);
  }

  @Permissions(PERMISSIONS.MEDIA_WRITE)
  @Delete('media/:id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.media.remove(tenantId, id);
  }
}
