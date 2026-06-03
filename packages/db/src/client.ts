import { PrismaClient } from '@prisma/client';

export type AicosPrismaClient = PrismaClient;

function logLevels(): ('warn' | 'error')[] {
  return process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'];
}

/**
 * App-runtime PrismaClient. Connects as the LEAST-PRIVILEGE application role
 * (`APP_DATABASE_URL`) — a non-superuser, non-BYPASSRLS role, so PostgreSQL RLS
 * is actually enforced. Falls back to `DATABASE_URL` only when `APP_DATABASE_URL`
 * is unset (dev convenience). Apps (NestJS) create exactly one via their DI
 * container; all tenant access MUST go through `withTenant()`, trusted
 * cross-tenant access through `withSystem()`.
 *
 * IMPORTANT: superusers and BYPASSRLS roles silently bypass RLS — the app role
 * must be neither. The privileged owner role is for migrations/seed only.
 */
export function createPrismaClient(): PrismaClient {
  const url = process.env.APP_DATABASE_URL || process.env.DATABASE_URL;
  return new PrismaClient({ ...(url ? { datasourceUrl: url } : {}), log: logLevels() });
}

/**
 * Privileged OWNER client (`DATABASE_URL`): the table owner / superuser, used
 * ONLY for migrations, RLS DDL, and seeding. RLS is bypassed for this role —
 * never use it to serve user requests.
 */
export function createOwnerClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  return new PrismaClient({ ...(url ? { datasourceUrl: url } : {}), log: logLevels() });
}
