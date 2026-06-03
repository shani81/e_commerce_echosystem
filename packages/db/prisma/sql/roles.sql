-- =============================================================================
-- AICOS — least-privilege application role
-- =============================================================================
-- Creates `aicos_app`, the role the API/worker connect as at RUNTIME. It is
-- NOSUPERUSER + NOBYPASSRLS so PostgreSQL Row-Level Security is actually
-- enforced (superusers and BYPASSRLS roles silently ignore RLS). The owner role
-- (DATABASE_URL) keeps superuser rights for migrations/extensions/seeding.
--
-- Idempotent — run after every `prisma db push` / `migrate` (via `pnpm db:rls`,
-- which runs this BEFORE enable-rls.sql). Re-granting is safe.
--
-- Dev password is fixed for local convenience; override in real environments.
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aicos_app') THEN
    EXECUTE 'CREATE ROLE aicos_app LOGIN PASSWORD ''aicos_app_dev_2026'' '
            'NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS';
  END IF;

  EXECUTE 'GRANT USAGE ON SCHEMA public TO aicos_app';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aicos_app';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aicos_app';
  -- Future tables/sequences created by the owner inherit these grants.
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aicos_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public '
          'GRANT USAGE, SELECT ON SEQUENCES TO aicos_app';
END $$;
