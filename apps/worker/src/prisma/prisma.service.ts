import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@aicos/db';

/**
 * The single PrismaClient for the worker process, owned by Nest's DI container.
 *
 * It wraps `createPrismaClient()` from `@aicos/db` (the one sanctioned factory)
 * rather than `new PrismaClient()` so the worker shares the exact connection
 * config and logging policy as the rest of AICOS. All tenant-scoped access must
 * still go through `withTenant()` / `withSystem()` from `@aicos/db`; this service
 * only owns the connection lifecycle.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** The underlying client. Pass it to `withTenant`/`withSystem`. */
  readonly client: PrismaClient = createPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
