-- Durable operation/repair intent for crash-safe resume versioning.
ALTER TABLE resume_versions
  ADD COLUMN IF NOT EXISTS operation_key text;

-- One result per (tenant, resume, operation intent). Nulls allowed for legacy rows.
CREATE UNIQUE INDEX IF NOT EXISTS resume_versions_tenant_resume_operation_uidx
  ON resume_versions (tenant_id, resume_id, operation_key)
  WHERE operation_key IS NOT NULL AND deleted_at IS NULL;
