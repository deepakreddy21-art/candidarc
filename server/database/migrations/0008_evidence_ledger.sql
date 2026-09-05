-- Evidence ledger fields for candidate-owned claims
ALTER TABLE evidence_items
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS claim_text text,
  ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS candidate_confirmation_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS employer_association text,
  ADD COLUMN IF NOT EXISTS project_association text;

CREATE INDEX IF NOT EXISTS evidence_items_source_type_idx
  ON evidence_items (tenant_id, source_type)
  WHERE deleted_at IS NULL;
