-- Persisted, tenant- and owner-scoped assistant threads.
CREATE TABLE IF NOT EXISTS assistant_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_type text NOT NULL,
  context_id text NOT NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_threads_public_id_uidx ON assistant_threads (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS assistant_threads_owner_context_uidx
  ON assistant_threads (tenant_id, user_id, context_type, context_id);
CREATE INDEX IF NOT EXISTS assistant_threads_tenant_user_idx ON assistant_threads (tenant_id, user_id);

ALTER TABLE assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE assistant_threads FORCE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assistant_threads' AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY tenant_isolation ON assistant_threads
      USING (tenant_id::text = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
  END IF;
END $$;
