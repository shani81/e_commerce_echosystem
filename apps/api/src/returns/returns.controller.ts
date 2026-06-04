import {
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
import { PERMISSIONS } from '../common/rbac/permissions';
import { ReturnsService } from './returns.service';
import { ListReturnsDto } from './dto/list-returns.dto';

/**
 * Admin returns (RMA) management (→ `/api/v1/returns`). Read for staff;
 * approve/reject/refund require `return:write`.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('returns')
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @Permissions(PERMISSIONS.RETURN_READ)
  list(@CurrentTenant() tenantId: string, @Query() query: ListReturnsDto) {
    return this.returns.list(tenantId, query);
  }

  @Get(':id')
  @Permissions(PERMISSIONS.RETURN_READ)
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.returns.findOne(tenantId, id);
  }

  @Post(':id/approve')
  @Permissions(PERMISSIONS.RETURN_WRITE)
  approve(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.returns.approve(tenantId, id);
  }

  @Post(':id/reject')
  @Permissions(PERMISSIONS.RETURN_WRITE)
  reject(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.returns.reject(tenantId, id);
  }

  @Post(':id/refund')
  @Permissions(PERMISSIONS.RETURN_WRITE)
  refund(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.returns.refund(tenantId, id);
  }
}
