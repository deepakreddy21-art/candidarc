-- CandidArc Radar — User persistence + catalog sightings (Release A.6)
-- Creates radar_* tables aligned with Drizzle schema (server/database/schema.ts).

BEGIN;

-- Core catalog tables (radar_* prefix; may coexist with legacy 0001 names)
CREATE TABLE IF NOT EXISTS radar_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  domain text,
  careers_url text,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_companies_public_id_uidx ON radar_companies (public_id);
CREATE INDEX IF NOT EXISTS radar_companies_normalized_name_idx ON radar_companies (normalized_name);

CREATE TABLE IF NOT EXISTS radar_job_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  provider_id text NOT NULL,
  display_name text NOT NULL,
  access_method radar_access_method NOT NULL,
  base_url text,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_sources_public_id_uidx ON radar_job_sources (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_sources_provider_id_uidx ON radar_job_sources (provider_id);

CREATE TABLE IF NOT EXISTS radar_canonical_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  company_id uuid NOT NULL REFERENCES radar_companies (id),
  company_name text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  department text,
  team text,
  employment_type text,
  seniority text,
  description text NOT NULL DEFAULT '',
  requirements text,
  preferred_qualifications text,
  responsibilities text,
  compensation jsonb,
  locations jsonb NOT NULL DEFAULT '[]'::jsonb,
  remote_policy text NOT NULL DEFAULT 'unknown',
  visa_sponsorship boolean,
  degree_required boolean,
  security_clearance_required boolean,
  tech_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_application_url text,
  employer_requisition_id text,
  original_posted_at timestamptz,
  original_posted_precision radar_timestamp_precision NOT NULL DEFAULT 'UNKNOWN',
  first_discovered_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  last_verified_precision radar_timestamp_precision NOT NULL DEFAULT 'UNKNOWN',
  reposted_at timestamptz,
  closed_at timestamptz,
  reopened_at timestamptz,
  status radar_job_status NOT NULL DEFAULT 'open',
  verification_state radar_verification_state NOT NULL DEFAULT 'LIKELY_OPEN',
  classification radar_job_classification NOT NULL DEFAULT 'NEW',
  classification_confidence numeric(5,4) NOT NULL DEFAULT 0,
  confidence numeric(5,4) NOT NULL DEFAULT 0,
  primary_source_id uuid REFERENCES radar_job_sources (id),
  repost_count integer NOT NULL DEFAULT 0,
  company_direct boolean NOT NULL DEFAULT false,
  demo_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_canonical_jobs_public_id_uidx ON radar_canonical_jobs (public_id);
CREATE INDEX IF NOT EXISTS radar_canonical_jobs_company_id_idx ON radar_canonical_jobs (company_id);
CREATE INDEX IF NOT EXISTS radar_canonical_jobs_status_idx ON radar_canonical_jobs (status);
CREATE INDEX IF NOT EXISTS radar_canonical_jobs_first_discovered_at_idx ON radar_canonical_jobs (first_discovered_at);

ALTER TABLE radar_canonical_jobs ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS radar_canonical_jobs_search_idx ON radar_canonical_jobs USING GIN (search_vector);

CREATE OR REPLACE FUNCTION update_radar_canonical_job_search_vector()
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

DROP TRIGGER IF EXISTS radar_canonical_jobs_search_vector_trigger ON radar_canonical_jobs;
CREATE TRIGGER radar_canonical_jobs_search_vector_trigger
  BEFORE INSERT OR UPDATE ON radar_canonical_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_radar_canonical_job_search_vector();

-- Sightings, snapshots, history
CREATE TABLE IF NOT EXISTS radar_job_sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES radar_job_sources (id),
  source_listing_id text NOT NULL,
  source_company_identifier text,
  source_requisition_id text,
  source_url text NOT NULL,
  source_apply_url text,
  source_title text NOT NULL,
  source_location text,
  source_posted_at timestamptz,
  source_posted_precision radar_timestamp_precision NOT NULL DEFAULT 'UNKNOWN',
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  removed_at timestamptz,
  reposted_at timestamptz,
  valid_through timestamptz,
  content_hash text NOT NULL,
  description_hash text NOT NULL,
  raw_snapshot_id uuid,
  classification radar_job_classification NOT NULL DEFAULT 'NEW',
  classification_confidence numeric(5,4) NOT NULL DEFAULT 0,
  demo_data boolean NOT NULL DEFAULT false,
  attribution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_sightings_public_id_uidx ON radar_job_sightings (public_id);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_sightings_source_listing_uidx ON radar_job_sightings (source_id, source_listing_id);
CREATE INDEX IF NOT EXISTS radar_job_sightings_canonical_job_id_idx ON radar_job_sightings (canonical_job_id);

CREATE TABLE IF NOT EXISTS radar_job_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sighting_id uuid NOT NULL REFERENCES radar_job_sightings (id) ON DELETE CASCADE,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text,
  compensation jsonb,
  source_posted_at timestamptz,
  application_url text,
  status radar_job_status NOT NULL DEFAULT 'open',
  raw_payload_ref text,
  material_change_summary text
);
CREATE INDEX IF NOT EXISTS radar_job_snapshots_sighting_id_idx ON radar_job_snapshots (sighting_id);

CREATE TABLE IF NOT EXISTS radar_job_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  sighting_id uuid REFERENCES radar_job_sightings (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL,
  metadata jsonb
);
CREATE INDEX IF NOT EXISTS radar_job_history_events_job_idx ON radar_job_history_events (canonical_job_id, occurred_at DESC);

-- Tenant-isolated user data
CREATE TABLE IF NOT EXISTS radar_saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  alert_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_saved_searches_public_id_uidx ON radar_saved_searches (public_id);
CREATE INDEX IF NOT EXISTS radar_saved_searches_tenant_user_idx ON radar_saved_searches (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS radar_saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_saved_jobs_tenant_user_job_uidx ON radar_saved_jobs (tenant_id, user_id, canonical_job_id);
CREATE INDEX IF NOT EXISTS radar_saved_jobs_tenant_idx ON radar_saved_jobs (tenant_id);

CREATE TABLE IF NOT EXISTS radar_hidden_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_hidden_jobs_tenant_user_job_uidx ON radar_hidden_jobs (tenant_id, user_id, canonical_job_id);
CREATE INDEX IF NOT EXISTS radar_hidden_jobs_tenant_idx ON radar_hidden_jobs (tenant_id);

CREATE TABLE IF NOT EXISTS radar_job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  score numeric(5,4) NOT NULL,
  breakdown jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_matches_tenant_user_job_uidx ON radar_job_matches (tenant_id, user_id, canonical_job_id);
CREATE INDEX IF NOT EXISTS radar_job_matches_tenant_idx ON radar_job_matches (tenant_id);

CREATE TABLE IF NOT EXISTS radar_job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  saved_search_id uuid REFERENCES radar_saved_searches (id) ON DELETE SET NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  cadence text NOT NULL DEFAULT 'immediate',
  enabled boolean NOT NULL DEFAULT true,
  include_reposts boolean NOT NULL DEFAULT true,
  include_refreshes boolean NOT NULL DEFAULT false,
  last_evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_alerts_public_id_uidx ON radar_job_alerts (public_id);
CREATE INDEX IF NOT EXISTS radar_job_alerts_tenant_user_idx ON radar_job_alerts (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS radar_job_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES radar_job_alerts (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  classification radar_job_classification NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'in_app',
  message text NOT NULL,
  dedupe_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_job_alert_deliveries_dedupe_uidx ON radar_job_alert_deliveries (dedupe_key);
CREATE INDEX IF NOT EXISTS radar_job_alert_deliveries_tenant_user_idx ON radar_job_alert_deliveries (tenant_id, user_id);

-- Runtime tables (radar_* names aligned with Drizzle)
CREATE TABLE IF NOT EXISTS radar_provider_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL UNIQUE,
  last_fetched_at timestamptz NOT NULL DEFAULT now(),
  last_cursor text,
  last_job_count integer,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS radar_opportunity_briefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  brief jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS radar_opportunity_briefs_tenant_user_job_uidx
  ON radar_opportunity_briefs (tenant_id, user_id, canonical_job_id);

CREATE TABLE IF NOT EXISTS radar_job_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES radar_canonical_jobs (id) ON DELETE CASCADE,
  interaction_type text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS radar_job_interactions_tenant_user_idx ON radar_job_interactions (tenant_id, user_id);
CREATE INDEX IF NOT EXISTS radar_job_interactions_created_idx ON radar_job_interactions (created_at DESC);

COMMIT;
