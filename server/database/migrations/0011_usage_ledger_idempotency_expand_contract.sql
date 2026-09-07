-- Migration: Expand/contract strategy for idempotency key indexing
--
-- CONTEXT:
-- Physical idempotency_key values used by the app are ALWAYS tenant-prefixed
-- (format: `${tenantId}:...`), making them globally unique. This allows us to
-- re-add a global unique index on idempotency_key alone while keeping the
-- composite index for tenant-scoped queries.
--
-- EXPAND PHASE (this migration):
-- 1. Re-add unique index on idempotency_key alone (IF NOT EXISTS)
-- 2. Keep composite (tenant_id, idempotency_key) for tenant-scoped queries
--
-- CONTRACT PHASE (future, optional):
-- Could remove composite index if all queries use the global index.
-- Not recommended until rollback window is closed.
--
-- ROLLBACK SAFETY:
-- - Rolling back APPLICATION CODE to pre-cutover that queries only by
--   idempotency_key is SAFE because keys are tenant-prefixed (globally unique).
-- - Rolling back SCHEMA by dropping the global unique index without understanding
--   that keys are tenant-prefixed is NOT safe if new app code relies on it.
-- - Git tag is NOT a DB rollback — migrations are forward-only.
--
-- CRASH SAFETY:
-- The transactional commitReservedWithCost method ensures that if a crash occurs
-- mid-commit, Postgres rolls back the entire transaction. We never leave a
-- committed reservation without a corresponding cost observation row.

BEGIN;

-- Re-add global unique index on idempotency_key alone.
-- Safe because all physical keys are tenant-prefixed (${tenantId}:...).
-- This enables efficient lookups by key alone when the app already knows the key
-- is correctly scoped.
CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_idempotency_key_global_uidx
  ON usage_ledger (idempotency_key);

-- Keep composite index for tenant-scoped queries.
-- Already exists from migration 0010; this is a no-op safety check.
CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_tenant_idempotency_uidx
  ON usage_ledger (tenant_id, idempotency_key);

COMMIT;

-- DOCUMENTATION:
-- The dual-index strategy allows:
-- 1. Tenant-scoped queries: WHERE tenant_id = $1 AND idempotency_key = $2
--    Uses the composite index.
-- 2. Global key lookups: WHERE idempotency_key = $1
--    Uses the global index. Safe because keys are tenant-prefixed.
--
-- Application code MUST ensure all idempotency_key values are tenant-prefixed
-- before insert. The UsageService.scopeKey() method enforces this.
