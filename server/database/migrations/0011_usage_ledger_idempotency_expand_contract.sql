-- Migration: Expand/contract strategy for idempotency key indexing
--
-- CONTEXT:
-- Application writes tenant-prefixed physical keys (`${tenantId}:...`).
-- Migration 0010 dropped the global unique index and kept only
-- (tenant_id, idempotency_key). Databases that stored the SAME unprefixed
-- logical key for multiple tenants would fail if we added a global unique
-- index without normalizing first.
--
-- THIS MIGRATION:
-- 1. Normalize any non-tenant-prefixed keys to `${tenant_id}:{original_key}`
--    (also preserves `:cost` / `:cost-unknown` suffixes by rewriting the base).
-- 2. Refuse to leave a key that is already prefixed with a *different* tenant id.
-- 3. Re-add the global unique index only after normalization.
-- 4. Keep the composite unique index for tenant-scoped lookups.
--
-- ROLLBACK SAFETY:
-- - Forward-only. Git tags are not database rollbacks.
-- - Application rollback that looks up by physical key alone remains safe only
--   after keys are tenant-prefixed (this migration).

BEGIN;

-- Detect keys already prefixed with a foreign tenant UUID (fail closed).
DO $$
DECLARE
  bad_count integer;
BEGIN
  SELECT COUNT(*) INTO bad_count
  FROM usage_ledger ul
  WHERE ul.idempotency_key ~ '^[0-9a-fA-F-]{36}:'
    AND split_part(ul.idempotency_key, ':', 1) <> ul.tenant_id::text;

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'usage_ledger contains % row(s) whose idempotency_key is prefixed with a different tenant id; refuse ambiguous cutover',
      bad_count;
  END IF;
END $$;

-- Normalize unprefixed / incorrectly scoped keys to tenant-prefixed form.
-- Skip rows already correctly prefixed with their own tenant_id.
UPDATE usage_ledger AS ul
SET idempotency_key = ul.tenant_id::text || ':' || ul.idempotency_key
WHERE ul.idempotency_key !~ ('^' || ul.tenant_id::text || ':');

-- Re-add global unique index on idempotency_key alone (safe after normalization).
CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_idempotency_key_global_uidx
  ON usage_ledger (idempotency_key);

-- Keep composite index for tenant-scoped queries.
CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_tenant_idempotency_uidx
  ON usage_ledger (tenant_id, idempotency_key);

COMMIT;

-- DOCUMENTATION:
-- Dual-index strategy:
-- 1. Tenant-scoped: WHERE tenant_id = $1 AND idempotency_key = $2
-- 2. Global key: WHERE idempotency_key = $1 (physical key already tenant-prefixed)
-- Application code MUST continue writing tenant-prefixed keys via UsageService.scopeKey().
