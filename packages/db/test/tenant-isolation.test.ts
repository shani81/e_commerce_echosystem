/**
 * Multi-tenant RLS isolation integration test.
 *
 * Gated on DATABASE_URL: if it is unset (e.g. CI unit lane with no Postgres),
 * the suite is skipped entirely. When it runs it requires a database that has
 * had `prisma/sql/enable-rls.sql` applied (pnpm db:rls), since the guarantees
 * under test are enforced by PostgreSQL Row-Level Security, not by Prisma.
 *
 * Verifies, using the `Brand` model (a simple tenant-scoped table):
 *   1. withTenant(A) lists ONLY tenant A's brand.
 *   2. withTenant(B) lists ONLY tenant B's brand.
 *   3. withTenant(A) cannot read B's brand by id (returns null — RLS USING).
 *   4. withTenant(A) cannot INSERT a row with tenantId = B (RLS WITH CHECK).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PrismaClient,
  TenantStatus,
  createPrismaClient,
  withSystem,
  withTenant,
} from '../src/index';

const HAS_DB = !!process.env.DATABASE_URL;
const describeIfDb = HAS_DB ? describe : describe.skip;

describeIfDb('tenant isolation (RLS)', () => {
  let prisma: PrismaClient;

  // Unique suffix so reruns / parallel runs never collide on natural keys.
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const tenantASlug = `iso-test-a-${suffix}`;
  const tenantBSlug = `iso-test-b-${suffix}`;

  let tenantAId = '';
  let tenantBId = '';
  let brandAId = '';
  let brandBId = '';

  beforeAll(async () => {
    prisma = createPrismaClient();

    await withSystem(prisma, async (tx) => {
      const tenantA = await tx.tenant.create({
        data: { slug: tenantASlug, name: 'Isolation Test A', status: TenantStatus.ACTIVE },
      });
      const tenantB = await tx.tenant.create({
        data: { slug: tenantBSlug, name: 'Isolation Test B', status: TenantStatus.ACTIVE },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      const brandA = await tx.brand.create({
        data: { tenantId: tenantAId, name: 'Brand A', slug: `brand-a-${suffix}` },
      });
      const brandB = await tx.brand.create({
        data: { tenantId: tenantBId, name: 'Brand B', slug: `brand-b-${suffix}` },
      });
      brandAId = brandA.id;
      brandBId = brandB.id;
    });
  });

  afterAll(async () => {
    if (prisma) {
      await withSystem(prisma, async (tx) => {
        await tx.brand.deleteMany({ where: { tenantId: { in: [tenantAId, tenantBId] } } });
        await tx.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
      });
      await prisma.$disconnect();
    }
  });

  it('withTenant(A) lists only tenant A rows', async () => {
    const brands = await withTenant(prisma, tenantAId, (tx) => tx.brand.findMany());
    expect(brands).toHaveLength(1);
    expect(brands[0]?.id).toBe(brandAId);
    expect(brands.every((b) => b.tenantId === tenantAId)).toBe(true);
  });

  it('withTenant(B) lists only tenant B rows', async () => {
    const brands = await withTenant(prisma, tenantBId, (tx) => tx.brand.findMany());
    expect(brands).toHaveLength(1);
    expect(brands[0]?.id).toBe(brandBId);
    expect(brands.every((b) => b.tenantId === tenantBId)).toBe(true);
  });

  it('withTenant(A) cannot read tenant B row by id (RLS USING hides it)', async () => {
    const found = await withTenant(prisma, tenantAId, (tx) =>
      tx.brand.findUnique({ where: { id: brandBId } }),
    );
    expect(found).toBeNull();
  });

  it('withTenant(A) cannot insert a row with tenantId = B (RLS WITH CHECK rejects)', async () => {
    await expect(
      withTenant(prisma, tenantAId, (tx) =>
        tx.brand.create({
          data: { tenantId: tenantBId, name: 'Smuggled', slug: `smuggled-${suffix}` },
        }),
      ),
    ).rejects.toThrow();

    // And nothing leaked into tenant B.
    const bBrands = await withTenant(prisma, tenantBId, (tx) => tx.brand.findMany());
    expect(bBrands.every((b) => b.name !== 'Smuggled')).toBe(true);
  });
});
