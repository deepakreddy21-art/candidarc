-- CandidArc Radar (Phase 3) schema
-- Shared canonical job catalog + tenant-isolated user interactions.

BEGIN;

CREATE TYPE radar_timestamp_precision AS ENUM (
  'EXACT_TIMESTAMP',
  'DATE_ONLY',
  'RELATIVE_HOURS',
  'RELATIVE_DAYS',
  'ESTIMATED',
  'FIRST_SEEN_ONLY',
  'UNKNOWN'
);

CREATE TYPE radar_job_classification AS ENUM (
  'NEW',
  'REPOSTED',
  'REFRESHED',
  'REOPENED',
  'DUPLICATE',
  'POSSIBLE_DUPLICATE',
  'UNCHANGED',
  'EXPIRED',
  'UNKNOWN'
);

CREATE TYPE radar_verification_state AS ENUM (
  'VERIFIED_OPEN',
  'LIKELY_OPEN',
  'STALE',
  'LIKELY_CLOSED',
  'CLOSED',
  'VERIFICATION_FAILED'
);

CREATE TYPE radar_license_status AS ENUM (
  'public',
  'licensed',
  'partner',
  'demo_fixture',
  'disabled',
  'pending_review',
  'revoked'
);

CREATE TYPE radar_access_method AS ENUM (
  'public_api',
  'partner_api',
  'licensed_feed',
  'ats_board_api',
  'structured_data',
  'xml_feed',
  'sitemap',
  'user_provided',
  'approved_integration',
  'disabled_pending_license'
);

CREATE TYPE radar_job_status AS ENUM ('open', 'closed', 'expired', 'unknown');

CREATE TABLE companies (
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
CREATE UNIQUE INDEX companies_public_id_uidx ON companies (public_id);
CREATE INDEX companies_normalized_name_idx ON companies (normalized_name);

CREATE TABLE job_sources (
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
CREATE UNIQUE INDEX job_sources_public_id_uidx ON job_sources (public_id);
CREATE UNIQUE INDEX job_sources_provider_id_uidx ON job_sources (provider_id);

CREATE TABLE job_source_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES job_sources (id) ON DELETE CASCADE,
  access_method radar_access_method NOT NULL,
  terms_url text NOT NULL,
  license_status radar_license_status NOT NULL,
  allowed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  attribution_required boolean NOT NULL DEFAULT true,
  attribution_text text NOT NULL,
  full_description_allowed boolean NOT NULL DEFAULT true,
  retention_days integer,
  refresh_limit_per_day integer,
  requests_per_minute integer NOT NULL DEFAULT 30,
  removal_required boolean NOT NULL DEFAULT true,
  commercial_use_allowed boolean NOT NULL DEFAULT false,
  last_compliance_review date,
  enabled boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_source_policies_source_uidx ON job_source_policies (source_id);

CREATE TABLE canonical_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  company_id uuid NOT NULL REFERENCES companies (id),
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
  classification_confidence real NOT NULL DEFAULT 0,
  confidence real NOT NULL DEFAULT 0,
  primary_source_id uuid REFERENCES job_sources (id),
  repost_count integer NOT NULL DEFAULT 0,
  company_direct boolean NOT NULL DEFAULT false,
  demo_data boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX canonical_jobs_public_id_uidx ON canonical_jobs (public_id);
CREATE INDEX canonical_jobs_company_id_idx ON canonical_jobs (company_id);
CREATE INDEX canonical_jobs_classification_idx ON canonical_jobs (classification);
CREATE INDEX canonical_jobs_original_posted_at_idx ON canonical_jobs (original_posted_at);
CREATE INDEX canonical_jobs_first_discovered_at_idx ON canonical_jobs (first_discovered_at);
CREATE INDEX canonical_jobs_reposted_at_idx ON canonical_jobs (reposted_at);
CREATE INDEX canonical_jobs_last_verified_at_idx ON canonical_jobs (last_verified_at);
CREATE INDEX canonical_jobs_status_idx ON canonical_jobs (status);
CREATE INDEX canonical_jobs_requisition_idx ON canonical_jobs (employer_requisition_id);

CREATE TABLE job_sightings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES job_sources (id),
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
  classification_confidence real NOT NULL DEFAULT 0,
  demo_data boolean NOT NULL DEFAULT false,
  attribution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_sightings_public_id_uidx ON job_sightings (public_id);
CREATE UNIQUE INDEX job_sightings_source_listing_uidx ON job_sightings (source_id, source_listing_id);
CREATE INDEX job_sightings_canonical_job_id_idx ON job_sightings (canonical_job_id);
CREATE INDEX job_sightings_source_posted_at_idx ON job_sightings (source_posted_at);
CREATE INDEX job_sightings_reposted_at_idx ON job_sightings (reposted_at);
CREATE INDEX job_sightings_classification_idx ON job_sightings (classification);

CREATE TABLE job_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sighting_id uuid NOT NULL REFERENCES job_sightings (id) ON DELETE CASCADE,
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
CREATE INDEX job_snapshots_sighting_id_idx ON job_snapshots (sighting_id);

CREATE TABLE job_history_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  sighting_id uuid REFERENCES job_sightings (id) ON DELETE SET NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL,
  metadata jsonb
);
CREATE INDEX job_history_events_job_idx ON job_history_events (canonical_job_id, occurred_at DESC);

-- Tenant-isolated user data
CREATE TABLE saved_searches (
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
CREATE UNIQUE INDEX saved_searches_public_id_uidx ON saved_searches (public_id);
CREATE INDEX saved_searches_tenant_user_idx ON saved_searches (tenant_id, user_id);

CREATE TABLE saved_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX saved_jobs_tenant_user_job_uidx ON saved_jobs (tenant_id, user_id, canonical_job_id);
CREATE INDEX saved_jobs_tenant_idx ON saved_jobs (tenant_id);

CREATE TABLE hidden_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX hidden_jobs_tenant_user_job_uidx ON hidden_jobs (tenant_id, user_id, canonical_job_id);
CREATE INDEX hidden_jobs_tenant_idx ON hidden_jobs (tenant_id);

CREATE TABLE job_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  score real NOT NULL,
  breakdown jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_matches_tenant_user_job_uidx ON job_matches (tenant_id, user_id, canonical_job_id);
CREATE INDEX job_matches_tenant_idx ON job_matches (tenant_id);

CREATE TABLE job_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  saved_search_id uuid REFERENCES saved_searches (id) ON DELETE SET NULL,
  query jsonb NOT NULL DEFAULT '{}'::jsonb,
  cadence text NOT NULL DEFAULT 'immediate',
  enabled boolean NOT NULL DEFAULT true,
  include_reposts boolean NOT NULL DEFAULT true,
  include_refreshes boolean NOT NULL DEFAULT false,
  last_evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX job_alerts_public_id_uidx ON job_alerts (public_id);
CREATE INDEX job_alerts_tenant_user_idx ON job_alerts (tenant_id, user_id);

CREATE TABLE job_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES job_alerts (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  classification radar_job_classification NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'in_app',
  message text NOT NULL,
  dedupe_key text NOT NULL
);
CREATE UNIQUE INDEX job_alert_deliveries_dedupe_uidx ON job_alert_deliveries (dedupe_key);
CREATE INDEX job_alert_deliveries_tenant_idx ON job_alert_deliveries (tenant_id, user_id);

CREATE TABLE job_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  canonical_job_id uuid NOT NULL REFERENCES canonical_jobs (id) ON DELETE CASCADE,
  interaction_type text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_interactions_tenant_user_idx ON job_interactions (tenant_id, user_id);
CREATE INDEX job_interactions_job_idx ON job_interactions (canonical_job_id);

COMMIT;
