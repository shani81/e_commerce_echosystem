-- =============================================================================
-- AICOS — Row-Level Security bootstrap
-- =============================================================================
-- Applies tenant-isolation RLS to EVERY base table that has a tenant column
-- (`tenant_id` or `tenantId`, depending on Prisma @map usage). Idempotent —
-- run after every `prisma db push` / `prisma migrate` (npm: `pnpm db:rls`).
--
-- Policy `tenant_isolation`: a row is visible/writable only when its tenant
-- column equals the transaction-local GUC `app.current_tenant` (set by
-- withTenant()), OR the trusted bypass GUC `app.bypass_rls` = 'on' (set only by
-- withSystem() in audited platform code). ENABLE + FORCE means the policy also
-- applies to the table owner (the application role), so a query with neither
-- GUC set sees nothing — deny by default.
--
-- Global/platform tables (plans, users, sessions, tenants, ...) have no tenant
-- column and are intentionally skipped.
-- =============================================================================
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ('tenant_id', 'tenantId')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', r.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I;', r.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%1$I '
      'USING (%2$I::text = current_setting(''app.current_tenant'', true) '
      '       OR current_setting(''app.bypass_rls'', true) = ''on'') '
      'WITH CHECK (%2$I::text = current_setting(''app.current_tenant'', true) '
      '       OR current_setting(''app.bypass_rls'', true) = ''on'');',
      r.table_name, r.column_name
    );
    RAISE NOTICE 'RLS enabled on public.% (tenant column: %)', r.table_name, r.column_name;
  END LOOP;
END $$;
