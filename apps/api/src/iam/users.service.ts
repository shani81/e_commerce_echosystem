import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import type {
  PaginatedResult,
  PaginationDto,
} from '../common/dto/pagination.dto';

export interface TeamMember {
  membershipId: string;
  userId: string;
  email: string;
  fullName: string | null;
  status: string;
  roleId: string;
  roleName: string;
  roleType: string;
  joinedAt: Date;
}

export interface RoleSummary {
  id: string;
  type: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
}

/**
 * Tenant-scoped identity reads. Every query runs through
 * `prisma.forTenant(tenantId, ...)`, so PostgreSQL RLS guarantees rows from
 * other tenants are never returned — even if a query were mis-written.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** The authenticated user's own profile within the active tenant. */
  async findMe(principal: AuthenticatedUser): Promise<TeamMember> {
    const member = await this.prisma.forTenant(principal.tenantId, (tx) =>
      tx.membership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: principal.tenantId,
            userId: principal.userId,
          },
        },
        include: { user: true, role: true },
      }),
    );
    if (!member) throw new NotFoundException('Membership not found');
    return this.toTeamMember(member);
  }

  /** Paginated list of team members (memberships) within the active tenant. */
  async listTeam(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<TeamMember>> {
    const { items, total } = await this.prisma.forTenant(tenantId, async (tx) => {
      const [rows, count] = await Promise.all([
        tx.membership.findMany({
          where: { tenantId },
          include: { user: true, role: true },
          orderBy: { createdAt: 'asc' },
          skip: pagination.skip,
          take: pagination.take,
        }),
        tx.membership.count({ where: { tenantId } }),
      ]);
      return { items: rows, total: count };
    });

    return {
      items: items.map((m) => this.toTeamMember(m)),
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  /** Built-in / custom roles available within the active tenant. */
  async listRoles(tenantId: string): Promise<RoleSummary[]> {
    const roles = await this.prisma.forTenant(tenantId, (tx) =>
      tx.role.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return roles.map((r) => ({
      id: r.id,
      type: r.type,
      name: r.name,
      description: r.description,
      permissions: this.toPermissionList(r.permissions),
      isSystem: r.isSystem,
    }));
  }

  private toTeamMember(member: {
    id: string;
    userId: string;
    roleId: string;
    status: string;
    createdAt: Date;
    user: { email: string; fullName: string | null };
    role: { name: string; type: string };
  }): TeamMember {
    return {
      membershipId: member.id,
      userId: member.userId,
      email: member.user.email,
      fullName: member.user.fullName,
      status: member.status,
      roleId: member.roleId,
      roleName: member.role.name,
      roleType: member.role.type,
      joinedAt: member.createdAt,
    };
  }

  private toPermissionList(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((p): p is string => typeof p === 'string')
      : [];
  }
}
