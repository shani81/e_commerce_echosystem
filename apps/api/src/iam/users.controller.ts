import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Permissions } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { PERMISSIONS } from '../common/rbac/permissions';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

/**
 * IAM endpoints (→ `/api/v1/users`, `/api/v1/roles`).
 * Guarded by JwtAuthGuard (authn) + RolesGuard (RBAC). `me` needs only a valid
 * session; team/role listing requires the `user:read` / `role:read` grants.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users/me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.findMe(user);
  }

  @Permissions(PERMISSIONS.USER_READ)
  @Get('users')
  listTeam(
    @CurrentTenant() tenantId: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.users.listTeam(tenantId, pagination);
  }

  @Permissions(PERMISSIONS.ROLE_READ)
  @Get('roles')
  listRoles(@CurrentTenant() tenantId: string) {
    return this.users.listRoles(tenantId);
  }
}
