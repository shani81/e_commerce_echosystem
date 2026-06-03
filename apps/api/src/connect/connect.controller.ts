import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';
import { ConnectService } from './connect.service';
import { CreateConnectAccountDto } from './dto/create-connect-account.dto';

/**
 * Stripe Connect onboarding for the authenticated tenant (admin app). Gated by
 * billing permissions — only the owner/manager configures payouts.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('connect')
export class ConnectController {
  constructor(private readonly connect: ConnectService) {}

  @Get('status')
  @Permissions(PERMISSIONS.BILLING_READ)
  status(@CurrentTenant() tenantId: string) {
    return this.connect.getStatus(tenantId);
  }

  @Post('account')
  @Permissions(PERMISSIONS.BILLING_WRITE)
  createAccount(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateConnectAccountDto,
  ) {
    return this.connect.createAccount(tenantId, dto);
  }

  @Post('onboarding-link')
  @Permissions(PERMISSIONS.BILLING_WRITE)
  onboardingLink(@CurrentTenant() tenantId: string) {
    return this.connect.createOnboardingLink(tenantId);
  }
}
