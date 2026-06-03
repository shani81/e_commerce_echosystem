import { Controller, Get, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PERMISSIONS } from '../common/rbac/permissions';

/**
 * Billing read APIs (→ `/api/v1/billing/*`).
 *  - `plans` is public (pricing page / marketing).
 *  - `subscription` is tenant-scoped and requires `billing:read`.
 */
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get('plans')
  listPlans() {
    return this.billing.listPlans();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Permissions(PERMISSIONS.BILLING_READ)
  @Get('subscription')
  getSubscription(@CurrentTenant() tenantId: string) {
    return this.billing.getSubscription(tenantId);
  }
}
