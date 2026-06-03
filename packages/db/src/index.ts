// @aicos/db — the single source of the AICOS database layer.
// Re-exports the generated Prisma client/types plus the multi-tenant RLS helpers.
export * from '@prisma/client';
export * from './client';
export * from './tenant';
