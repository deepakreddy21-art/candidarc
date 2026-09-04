-- Candidate profile preferences, onboarding state, and resume import linkage
ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS remote_ok boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS preferred_locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_authorization text,
  ADD COLUMN IF NOT EXISTS requires_sponsorship boolean,
  ADD COLUMN IF NOT EXISTS onboarding_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS model_improvement_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_resume_file_public_id text,
  ADD COLUMN IF NOT EXISTS resume_import_status text,
  ADD COLUMN IF NOT EXISTS resume_import_extraction jsonb;

CREATE INDEX IF NOT EXISTS candidate_profiles_user_tenant_idx
  ON candidate_profiles (tenant_id, user_id)
  WHERE deleted_at IS NULL;
