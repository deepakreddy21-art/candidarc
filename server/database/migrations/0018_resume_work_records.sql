-- Expand-only. Keep operation allowance records indefinitely: deletion would permit redispatch.
CREATE TABLE IF NOT EXISTS resume_work_records (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('profile','job','operation','export','research','edit','upload')),
  key text NOT NULL,
  state text NOT NULL DEFAULT 'ready',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  lease_token text,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id, kind, key)
);
ALTER TABLE resume_work_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_work_records FORCE ROW LEVEL SECURITY;
CREATE POLICY resume_work_records_tenant ON resume_work_records
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
-- Serves bounded retention inventory, not generation lookups (which use the primary key).
CREATE INDEX resume_work_records_inventory ON resume_work_records(tenant_id, owner_user_id, kind, updated_at);
