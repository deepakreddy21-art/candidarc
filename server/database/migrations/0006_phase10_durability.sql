-- Phase 10: columns required for Postgres repository parity with memory records

BEGIN;

ALTER TABLE usage_ledger
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'committed';

ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS resume_versions_tenant_idempotency_uidx
  ON resume_versions (tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE evidence_items
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE stored_files
  ADD COLUMN IF NOT EXISTS physical_delete_at timestamptz;

ALTER TABLE audit_findings
  ADD COLUMN IF NOT EXISTS edited_text text;

COMMIT;
