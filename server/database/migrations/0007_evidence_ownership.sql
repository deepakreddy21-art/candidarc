-- Evidence ownership: tie evidence items to users and candidate profiles
ALTER TYPE verification_status ADD VALUE IF NOT EXISTS 'user_attested';

ALTER TABLE evidence_items
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS candidate_profile_id uuid REFERENCES candidate_profiles (id) ON DELETE SET NULL;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS candidate_profile_id uuid REFERENCES candidate_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS evidence_items_tenant_owner_idx
  ON evidence_items (tenant_id, owner_user_id)
  WHERE deleted_at IS NULL;
