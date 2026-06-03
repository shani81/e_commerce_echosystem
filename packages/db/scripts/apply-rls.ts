// Applies the AICOS SQL bootstrap to the database in DATABASE_URL (owner role):
//   1) roles.sql      — create the least-privilege `aicos_app` runtime role + grants
//   2) enable-rls.sql — FORCE RLS + tenant-isolation policy on every tenant table
// Cross-platform (no psql needed). Run with: pnpm db:rls
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOwnerClient } from '../src/client';

async function main() {
  const dir = join(__dirname, '..', 'prisma', 'sql');
  // Must run as the OWNER/superuser (CREATE ROLE + policies), never the app role.
  const prisma = createOwnerClient();
  try {
    for (const file of ['roles.sql', 'enable-rls.sql']) {
      const sql = readFileSync(join(dir, file), 'utf8');
      await prisma.$executeRawUnsafe(sql);
      console.log(`✓ applied ${file}`);
    }
    console.log('✓ app role + RLS policies applied to all tenant-scoped tables');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('✗ Failed to apply roles/RLS:', err);
  process.exit(1);
});
