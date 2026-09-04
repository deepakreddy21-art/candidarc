-- CandidArc Radar — Runtime Tables and FTS (Release A.6)
-- Adds FTS support and runtime tables for opportunity briefs, interactions, and provider checkpoints.

BEGIN;

-- Add search_vector column to canonical_jobs for FTS
ALTER TABLE canonical_jobs ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for FTS
CREATE INDEX IF NOT EXISTS canonical_jobs_search_idx ON canonical_jobs USING GIN (search_vector);

-- Function to update search_vector
CREATE OR REPLACE FUNCTION update_canonical_job_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.company_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.requirements, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.responsibilities, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE((
      SELECT string_agg(elem, ' ')
      FROM jsonb_array_elements_text(COALESCE(NEW.tech_stack, '[]'::jsonb)) AS elem
    ), '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update search_vector
DROP TRIGGER IF EXISTS canonical_jobs_search_vector_trigger ON canonical_jobs;
CREATE TRIGGER canonical_jobs_search_vector_trigger
  BEFORE INSERT OR UPDATE ON canonical_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_canonical_job_search_vector();

-- Update existing rows to populate search_vector
UPDATE canonical_jobs SET search_vector = 
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(company_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(requirements, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(responsibilities, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE((
    SELECT string_agg(elem, ' ')
    FROM jsonb_array_elements_text(COALESCE(tech_stack, '[]'::jsonb)) AS elem
  ), '')), 'B');

-- Opportunity briefs table (if not in 0001_radar.sql)
CREATE TABLE IF NOT EXISTS opportunity_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  brief jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS opportunity_briefs_tenant_user_job_uidx 
  ON opportunity_briefs (tenant_id, user_id, canonical_job_id);
CREATE INDEX IF NOT EXISTS opportunity_briefs_tenant_idx ON opportunity_briefs (tenant_id);

-- Provider checkpoints table (if not in 0001_radar.sql)
CREATE TABLE IF NOT EXISTS provider_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL UNIQUE,
  last_fetched_at timestamptz NOT NULL DEFAULT now(),
  last_cursor text,
  last_job_count integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS provider_checkpoints_provider_uidx ON provider_checkpoints (provider_id);

-- Job interactions table updates (ensure additional columns if needed)
-- The base table should exist from 0001_radar.sql
-- Adding index if missing
CREATE INDEX IF NOT EXISTS job_interactions_created_idx ON job_interactions (created_at DESC);

COMMIT;
