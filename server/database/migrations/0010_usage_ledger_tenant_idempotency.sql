-- Tenant-scoped usage idempotency: replace global unique key with (tenant_id, idempotency_key).

BEGIN;

DROP INDEX IF EXISTS usage_ledger_idempotency_uidx;

CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_tenant_idempotency_uidx
  ON usage_ledger (tenant_id, idempotency_key);

COMMIT;
