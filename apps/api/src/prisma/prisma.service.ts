import type {
  OnModuleDestroy,
  OnModuleInit} from '@nestjs/common';
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  type AicosPrismaClient,
  type Prisma,
  createPrismaClient,
  withSystem,
  withTenant,
} from '@aicos/db';

/**
 * Single owner of the application's PrismaClient.
 *
 * The raw client connects as the application DB role, which is subject to
 * `FORCE ROW LEVEL SECURITY`. Therefore:
 *   - tenant-scoped reads/writes MUST go through {@link forTenant} (sets the
 *     `app.current_tenant` GUC transaction-locally so RLS filters every row);
 *   - trusted cross-tenant work (auth lookups, webhooks, seeding) goes through
 *     {@link asSystem}.
 *
 * Both delegate to the canonical helpers exported by `@aicos/db`. Do NOT use
 * `service.client.<model>` directly for tenant data — it runs without a tenant
 * GUC and RLS will (correctly) return nothing.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** The underlying Prisma client. Prefer {@link forTenant}/{@link asSystem}. */
  public readonly client: AicosPrismaClient;

  constructor() {
    this.client = createPrismaClient();
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Prisma connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
    this.logger.log('Prisma disconnected');
  }

  /**
   * Run `fn` inside a transaction scoped to `tenantId`. PostgreSQL RLS restricts
   * every statement to that tenant's rows. This is the sanctioned path for all
   * tenant-scoped DB access.
   */
  forTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withTenant(this.client, tenantId, fn);
  }

  /**
   * Run `fn` with RLS bypassed, for TRUSTED platform operations spanning tenants
   * (authentication, billing webhooks, super-admin tooling). Keep call sites few
   * and auditable; never pass user-controlled scope in here.
   */
  asSystem<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return withSystem(this.client, fn);
  }
}
