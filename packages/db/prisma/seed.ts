/**
 * AICOS database seed.
 *
 * Idempotent: every insert upserts on a natural key, so running it repeatedly
 * converges to the same state. Run with: `pnpm db:seed` (tsx prisma/seed.ts).
 *
 * Seeds:
 *   - the 5 global Plans (Free/Starter/Growth/Pro/Enterprise)
 *   - a Platform Super Admin User + platform-global PLATFORM_SUPER_ADMIN Role
 *   - a demo Tenant ("demo") with a STORE_OWNER Role, an owner User, the
 *     owning Membership, and a demo Store
 *
 * Imports the client + tenant helpers from ../src/index (relative) so it runs
 * via tsx without depending on the package build.
 */
import * as argon2 from 'argon2';
import {
  Prisma,
  TenantPlanTier,
  TenantStatus,
  UserStatus,
  RoleType,
  MembershipStatus,
  StoreStatus,
  createOwnerClient,
  withSystem,
} from '../src/index';

// Seeding runs as the privileged OWNER role (RLS bypassed) — it inserts the
// platform-global super-admin role (tenantId = null) which RLS would otherwise
// reject. Tenant-scoped rows still go through withSystem() for clarity.
const prisma = createOwnerClient();

const SUPER_ADMIN_EMAIL = 'superadmin@aicos.local';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'SuperAdmin!2026';
const DEMO_OWNER_EMAIL = 'admin@aicos.local';
const DEMO_OWNER_PASSWORD = process.env.DEMO_ADMIN_PASSWORD || 'Admin!2026';
const DEMO_TENANT_SLUG = 'demo';

/** Global pricing plans. priceYearly ~= 10x monthly (two months free). */
const PLANS: Prisma.PlanCreateInput[] = [
  {
    tier: TenantPlanTier.FREE,
    name: 'Free',
    priceMonthlyCents: 0,
    priceYearlyCents: 0,
    maxProducts: 20,
    maxStores: 1,
    maxStaffSeats: 1,
    includedExtractionMinutes: 5,
    includedGenerationCredits: 50,
    transactionFeeBps: 200,
    sortOrder: 0,
  },
  {
    tier: TenantPlanTier.STARTER,
    name: 'Starter',
    priceMonthlyCents: 2900,
    priceYearlyCents: 29000,
    maxProducts: 200,
    maxStores: 1,
    maxStaffSeats: 3,
    includedExtractionMinutes: 30,
    includedGenerationCredits: 500,
    transactionFeeBps: 100,
    sortOrder: 1,
  },
  {
    tier: TenantPlanTier.GROWTH,
    name: 'Growth',
    priceMonthlyCents: 9900,
    priceYearlyCents: 99000,
    maxProducts: 2000,
    maxStores: 3,
    maxStaffSeats: 10,
    includedExtractionMinutes: 120,
    includedGenerationCredits: 2500,
    transactionFeeBps: 50,
    sortOrder: 2,
  },
  {
    tier: TenantPlanTier.PRO,
    name: 'Pro',
    priceMonthlyCents: 29900,
    priceYearlyCents: 299000,
    maxProducts: 20000,
    maxStores: 10,
    maxStaffSeats: 25,
    includedExtractionMinutes: 600,
    includedGenerationCredits: 10000,
    transactionFeeBps: 0,
    sortOrder: 3,
  },
  {
    tier: TenantPlanTier.ENTERPRISE,
    name: 'Enterprise',
    priceMonthlyCents: 99900,
    priceYearlyCents: 999000,
    maxProducts: 1000000,
    maxStores: 100,
    maxStaffSeats: 250,
    includedExtractionMinutes: 3000,
    includedGenerationCredits: 100000,
    transactionFeeBps: 0,
    sortOrder: 4,
  },
];

async function seedPlans(): Promise<void> {
  for (const plan of PLANS) {
    await prisma.plan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        priceMonthlyCents: plan.priceMonthlyCents,
        priceYearlyCents: plan.priceYearlyCents,
        maxProducts: plan.maxProducts,
        maxStores: plan.maxStores,
        maxStaffSeats: plan.maxStaffSeats,
        includedExtractionMinutes: plan.includedExtractionMinutes,
        includedGenerationCredits: plan.includedGenerationCredits,
        transactionFeeBps: plan.transactionFeeBps,
        sortOrder: plan.sortOrder,
        isActive: true,
      },
      create: plan,
    });
  }
  console.log(`  plans: upserted ${PLANS.length}`);
}

/** Platform-global role (tenantId = null). Upsert by (tenantId, name) is awkward
 * with a null component, so do an explicit find-or-create. */
async function ensurePlatformSuperAdminRole(): Promise<string> {
  const existing = await prisma.role.findFirst({
    where: { tenantId: null, type: RoleType.PLATFORM_SUPER_ADMIN },
  });
  if (existing) return existing.id;
  const role = await prisma.role.create({
    data: {
      tenantId: null,
      type: RoleType.PLATFORM_SUPER_ADMIN,
      name: 'Platform Super Admin',
      description: 'Full platform access across all tenants.',
      permissions: ['*:*'],
      isSystem: true,
    },
  });
  return role.id;
}

async function seedSuperAdmin(): Promise<void> {
  await ensurePlatformSuperAdminRole();
  const passwordHash = await argon2.hash(SUPER_ADMIN_PASSWORD);
  await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      email: SUPER_ADMIN_EMAIL,
      passwordHash,
      fullName: 'Platform Super Admin',
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });
  console.log(`  super admin: ${SUPER_ADMIN_EMAIL}`);
}

async function seedDemoTenant(): Promise<void> {
  // Tenant (global table, not RLS-scoped).
  const tenant = await prisma.tenant.upsert({
    where: { slug: DEMO_TENANT_SLUG },
    update: {},
    create: {
      slug: DEMO_TENANT_SLUG,
      name: 'Demo Store',
      status: TenantStatus.ACTIVE,
      planTier: TenantPlanTier.FREE,
      defaultCurrency: 'USD',
      defaultLocale: 'en',
    },
  });

  // Owner user (global table).
  const ownerPasswordHash = await argon2.hash(DEMO_OWNER_PASSWORD);
  const owner = await prisma.user.upsert({
    where: { email: DEMO_OWNER_EMAIL },
    update: { status: UserStatus.ACTIVE, emailVerified: true },
    create: {
      email: DEMO_OWNER_EMAIL,
      passwordHash: ownerPasswordHash,
      fullName: 'Demo Owner',
      status: UserStatus.ACTIVE,
      emailVerified: true,
    },
  });

  // Tenant-scoped rows go through withSystem (RLS bypass for trusted seeding).
  await withSystem(prisma, async (tx) => {
    // Owner role (tenant-scoped). Natural key: (tenantId, name).
    const ownerRole = await tx.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'Owner' } },
      update: {},
      create: {
        tenantId: tenant.id,
        type: RoleType.STORE_OWNER,
        name: 'Owner',
        description: 'Tenant owner with full store access.',
        permissions: ['*:*'],
        isSystem: true,
      },
    });

    // Membership: owner <-> demo tenant. Natural key: (tenantId, userId).
    await tx.membership.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: owner.id } },
      update: { status: MembershipStatus.ACTIVE, roleId: ownerRole.id },
      create: {
        tenantId: tenant.id,
        userId: owner.id,
        roleId: ownerRole.id,
        status: MembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });

    // Demo store. Natural key: (tenantId, slug).
    await tx.store.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: 'demo' } },
      update: {},
      create: {
        tenantId: tenant.id,
        name: 'Demo Store',
        slug: 'demo',
        status: StoreStatus.PUBLISHED,
        currency: 'USD',
        primaryLocale: 'en',
        publishedAt: new Date(),
      },
    });
  });

  console.log(`  demo tenant: ${DEMO_TENANT_SLUG} (owner ${DEMO_OWNER_EMAIL})`);
}

async function main(): Promise<void> {
  console.log('Seeding AICOS database...');
  await seedPlans();
  await seedSuperAdmin();
  await seedDemoTenant();
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
