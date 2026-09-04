-- CandidArc Phase 2 initial schema
-- Multi-tenant PostgreSQL with soft deletes, public IDs, and optimistic concurrency.
-- Timestamps are timestamptz (UTC).
--
-- RLS: FORCE ROW LEVEL SECURITY is enabled on tenant-owned tables with stub policies.
-- Application code must SET LOCAL app.tenant_id = '<uuid>' (or equivalent) per transaction
-- before querying. Full policy expressions can be refined once session GUC helpers land.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums
CREATE TYPE tenant_role AS ENUM ('owner', 'admin', 'member', 'viewer', 'support');
CREATE TYPE tenant_plan AS ENUM ('free', 'pro', 'team', 'enterprise');
CREATE TYPE application_status AS ENUM (
  'draft', 'researching', 'evidence', 'resume', 'auditing',
  'final-qa', 'ready', 'interviewing', 'archived'
);
CREATE TYPE workflow_stage AS ENUM (
  'APPLICATION_CREATED',
  'RESEARCH_QUEUED', 'RESEARCH_RUNNING', 'RESEARCH_REVIEW_REQUIRED', 'RESEARCH_COMPLETED',
  'EVIDENCE_MATCHING_RUNNING', 'EVIDENCE_MATCHING_COMPLETED',
  'V0_GENERATING', 'V0_READY',
  'HR_AUDIT_1_RUNNING', 'HR_AUDIT_1_REVIEW', 'V1_GENERATING', 'V1_READY',
  'EM_AUDIT_1_RUNNING', 'EM_AUDIT_1_REVIEW', 'V2_GENERATING', 'V2_READY',
  'HR_AUDIT_2_RUNNING', 'HR_AUDIT_2_REVIEW', 'V3_GENERATING', 'V3_READY',
  'EM_AUDIT_2_RUNNING', 'EM_AUDIT_2_REVIEW', 'V4_GENERATING', 'V4_READY',
  'FINAL_QA_RUNNING', 'FINAL_QA_FAILED', 'FINAL_READY',
  'CANCELLED', 'FAILED'
);
CREATE TYPE workflow_run_status AS ENUM (
  'queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled', 'retrying'
);
CREATE TYPE interview_status AS ENUM ('not-started', 'preparing', 'ready', 'completed');
CREATE TYPE confidence AS ENUM ('high', 'medium', 'low');
CREATE TYPE verification_status AS ENUM ('verified', 'inferred', 'unverified', 'disputed');
CREATE TYPE privacy_level AS ENUM ('public', 'share-safe', 'private', 'do-not-use');
CREATE TYPE finding_severity AS ENUM ('critical', 'major', 'minor', 'suggestion');
CREATE TYPE finding_status AS ENUM ('open', 'accepted', 'edited', 'rejected', 'deferred');
CREATE TYPE audit_lens AS ENUM ('hr-1', 'em-1', 'hr-2', 'em-2', 'final-qa');
CREATE TYPE usage_kind AS ENUM (
  'research', 'resume_generation', 'audit', 'embedding',
  'interview_minutes', 'transcription_minutes', 'storage', 'export',
  'input_tokens', 'output_tokens', 'provider_cost'
);
CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'published', 'failed');

-- Identity
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL DEFAULT false,
  password_hash text,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX users_public_id_uidx ON users (public_id);
CREATE UNIQUE INDEX users_email_uidx ON users (email);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  name text NOT NULL,
  plan tenant_plan NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenants_public_id_uidx ON tenants (public_id);

CREATE TABLE tenant_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX tenant_memberships_tenant_user_uidx ON tenant_memberships (tenant_id, user_id);
CREATE INDEX tenant_memberships_user_idx ON tenant_memberships (user_id);
CREATE INDEX tenant_memberships_tenant_idx ON tenant_memberships (tenant_id);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE UNIQUE INDEX sessions_token_hash_uidx ON sessions (token_hash);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- Candidate & applications
CREATE TABLE candidate_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  full_name text NOT NULL,
  preferred_name text,
  email text,
  phone text,
  location text,
  linkedin text,
  github text,
  portfolio text,
  headline text,
  summary text,
  experience_level text,
  years_experience integer,
  target_role_families jsonb DEFAULT '[]'::jsonb,
  preferred_resume_length text,
  career_goal text,
  avatar_initials text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX candidate_profiles_public_id_uidx ON candidate_profiles (public_id);
CREATE INDEX candidate_profiles_tenant_idx ON candidate_profiles (tenant_id);

CREATE TABLE job_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  title text NOT NULL,
  company text NOT NULL,
  location text,
  employment_type text,
  source text,
  url text,
  posted_at timestamptz,
  deadline text,
  raw_text text NOT NULL DEFAULT '',
  requirements jsonb DEFAULT '[]'::jsonb,
  preferred jsonb DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX job_descriptions_public_id_uidx ON job_descriptions (public_id);
CREATE INDEX job_descriptions_tenant_idx ON job_descriptions (tenant_id);

CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  company text NOT NULL,
  company_mark text,
  role text NOT NULL,
  location text,
  employment_type text,
  status application_status NOT NULL DEFAULT 'draft',
  stage workflow_stage NOT NULL DEFAULT 'APPLICATION_CREATED',
  workflow_stage workflow_stage NOT NULL DEFAULT 'APPLICATION_CREATED',
  resume_score integer NOT NULL DEFAULT 0,
  evidence_coverage integer NOT NULL DEFAULT 0,
  ats_alignment integer NOT NULL DEFAULT 0,
  interview_status interview_status NOT NULL DEFAULT 'not-started',
  research_confidence integer NOT NULL DEFAULT 0,
  deadline text,
  archived boolean NOT NULL DEFAULT false,
  role_family text,
  next_action text,
  job_description_id uuid REFERENCES job_descriptions (id) ON DELETE SET NULL,
  resume_id uuid,
  owner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  candidate_profile_id uuid REFERENCES candidate_profiles (id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX applications_public_id_uidx ON applications (public_id);
CREATE INDEX applications_tenant_idx ON applications (tenant_id);
CREATE INDEX applications_tenant_status_idx ON applications (tenant_id, status);
CREATE INDEX applications_owner_idx ON applications (owner_user_id);

-- Research
CREATE TABLE research_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued',
  depth text NOT NULL DEFAULT 'standard',
  confidence integer DEFAULT 0,
  workflow_run_id uuid,
  prompt_version text,
  error_message text,
  version integer NOT NULL DEFAULT 1,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX research_runs_public_id_uidx ON research_runs (public_id);
CREATE INDEX research_runs_tenant_idx ON research_runs (tenant_id);
CREATE INDEX research_runs_application_idx ON research_runs (application_id);

CREATE TABLE research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES research_runs (id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications (id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  accessed_at timestamptz,
  type text NOT NULL DEFAULT 'job-posting',
  raw_snippet text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX research_sources_public_id_uidx ON research_sources (public_id);
CREATE INDEX research_sources_tenant_idx ON research_sources (tenant_id);
CREATE INDEX research_sources_run_idx ON research_sources (research_run_id);

CREATE TABLE research_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  research_run_id uuid REFERENCES research_runs (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  category text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  confidence confidence NOT NULL DEFAULT 'medium',
  status verification_status NOT NULL DEFAULT 'inferred',
  source_ids jsonb DEFAULT '[]'::jsonb,
  use_in_resume_strategy boolean NOT NULL DEFAULT true,
  date_accessed timestamptz,
  uncertainty_note text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX research_findings_public_id_uidx ON research_findings (public_id);
CREATE INDEX research_findings_tenant_idx ON research_findings (tenant_id);
CREATE INDEX research_findings_application_idx ON research_findings (application_id);

-- Evidence
CREATE TABLE evidence_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  title text NOT NULL,
  organization text,
  situation text,
  task text,
  actions jsonb DEFAULT '[]'::jsonb,
  result text,
  technologies jsonb DEFAULT '[]'::jsonb,
  role_relevance jsonb DEFAULT '[]'::jsonb,
  confidence confidence NOT NULL DEFAULT 'medium',
  verification_status verification_status NOT NULL DEFAULT 'unverified',
  supporting_source text,
  privacy_level privacy_level NOT NULL DEFAULT 'share-safe',
  resume_usage_history jsonb DEFAULT '[]'::jsonb,
  interview_story_ready boolean NOT NULL DEFAULT false,
  tags jsonb DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX evidence_items_public_id_uidx ON evidence_items (public_id);
CREATE INDEX evidence_items_tenant_idx ON evidence_items (tenant_id);

CREATE TABLE evidence_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items (id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL,
  unit text,
  baseline text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX evidence_metrics_public_id_uidx ON evidence_metrics (public_id);
CREATE INDEX evidence_metrics_tenant_idx ON evidence_metrics (tenant_id);
CREATE INDEX evidence_metrics_item_idx ON evidence_metrics (evidence_item_id);

CREATE TABLE evidence_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items (id) ON DELETE CASCADE,
  stored_file_id uuid,
  label text,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX evidence_attachments_public_id_uidx ON evidence_attachments (public_id);
CREATE INDEX evidence_attachments_tenant_idx ON evidence_attachments (tenant_id);
CREATE INDEX evidence_attachments_item_idx ON evidence_attachments (evidence_item_id);

CREATE TABLE evidence_application_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  evidence_item_id uuid NOT NULL REFERENCES evidence_items (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  requirement text,
  importance text DEFAULT 'required',
  evidence_strength confidence DEFAULT 'medium',
  resume_usage text DEFAULT 'unused',
  coverage_gap text,
  excluded boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX evidence_application_matches_public_id_uidx ON evidence_application_matches (public_id);
CREATE UNIQUE INDEX evidence_application_matches_pair_uidx
  ON evidence_application_matches (evidence_item_id, application_id, requirement);
CREATE INDEX evidence_application_matches_tenant_idx ON evidence_application_matches (tenant_id);
CREATE INDEX evidence_application_matches_application_idx ON evidence_application_matches (application_id);

-- Resumes (versions immutable after create)
CREATE TABLE resumes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  title text NOT NULL,
  template_id text NOT NULL DEFAULT 'alumni-clean',
  length text NOT NULL DEFAULT 'one-page',
  current_version_id uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX resumes_public_id_uidx ON resumes (public_id);
CREATE INDEX resumes_tenant_idx ON resumes (tenant_id);
CREATE INDEX resumes_application_idx ON resumes (application_id);

CREATE TABLE resume_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  resume_id uuid NOT NULL REFERENCES resumes (id) ON DELETE CASCADE,
  version_label text NOT NULL,
  version_number integer NOT NULL,
  notes text,
  score integer NOT NULL DEFAULT 0,
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  triggered_by text,
  prompt_version text,
  workflow_run_id uuid,
  locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX resume_versions_public_id_uidx ON resume_versions (public_id);
CREATE UNIQUE INDEX resume_versions_resume_number_uidx ON resume_versions (resume_id, version_number);
CREATE INDEX resume_versions_tenant_idx ON resume_versions (tenant_id);
CREATE INDEX resume_versions_resume_idx ON resume_versions (resume_id);

CREATE TABLE resume_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  resume_version_id uuid NOT NULL REFERENCES resume_versions (id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX resume_sections_public_id_uidx ON resume_sections (public_id);
CREATE INDEX resume_sections_tenant_idx ON resume_sections (tenant_id);
CREATE INDEX resume_sections_version_idx ON resume_sections (resume_version_id);

CREATE TABLE resume_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  resume_version_id uuid NOT NULL REFERENCES resume_versions (id) ON DELETE CASCADE,
  section_id uuid REFERENCES resume_sections (id) ON DELETE SET NULL,
  bullet_id text,
  text text NOT NULL,
  evidence_ids jsonb DEFAULT '[]'::jsonb,
  research_requirement_ids jsonb DEFAULT '[]'::jsonb,
  confidence confidence NOT NULL DEFAULT 'medium',
  unsupported boolean NOT NULL DEFAULT false,
  metrics_used jsonb DEFAULT '[]'::jsonb,
  transformations jsonb DEFAULT '[]'::jsonb,
  verification_state verification_status DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX resume_claims_public_id_uidx ON resume_claims (public_id);
CREATE INDEX resume_claims_tenant_idx ON resume_claims (tenant_id);
CREATE INDEX resume_claims_version_idx ON resume_claims (resume_version_id);

-- Audits
CREATE TABLE audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  lens audit_lens NOT NULL,
  label text NOT NULL,
  reviews_version text NOT NULL,
  produces_version text,
  status text NOT NULL DEFAULT 'pending',
  score_before integer NOT NULL DEFAULT 0,
  score_after integer,
  summary text,
  workflow_run_id uuid,
  prompt_version text,
  version integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX audit_runs_public_id_uidx ON audit_runs (public_id);
CREATE INDEX audit_runs_tenant_idx ON audit_runs (tenant_id);
CREATE INDEX audit_runs_application_idx ON audit_runs (application_id);

CREATE TABLE audit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  audit_run_id uuid NOT NULL REFERENCES audit_runs (id) ON DELETE CASCADE,
  severity finding_severity NOT NULL,
  status finding_status NOT NULL DEFAULT 'open',
  section text,
  title text NOT NULL,
  explanation text NOT NULL,
  before_text text,
  suggested_text text,
  evidence_source text,
  expected_score_impact integer DEFAULT 0,
  bullet_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX audit_findings_public_id_uidx ON audit_findings (public_id);
CREATE INDEX audit_findings_tenant_idx ON audit_findings (tenant_id);
CREATE INDEX audit_findings_run_idx ON audit_findings (audit_run_id);

CREATE TABLE audit_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  audit_finding_id uuid NOT NULL REFERENCES audit_findings (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  status finding_status NOT NULL,
  edited_text text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX audit_decisions_public_id_uidx ON audit_decisions (public_id);
CREATE INDEX audit_decisions_tenant_idx ON audit_decisions (tenant_id);
CREATE INDEX audit_decisions_finding_idx ON audit_decisions (audit_finding_id);

CREATE TABLE mistake_memory_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  originating_audit audit_lens NOT NULL,
  originating_audit_run_id uuid REFERENCES audit_runs (id) ON DELETE SET NULL,
  affected_version text NOT NULL,
  category text,
  rule text NOT NULL,
  machine_constraint jsonb,
  severity finding_severity DEFAULT 'minor',
  status text NOT NULL DEFAULT 'active',
  user_override boolean NOT NULL DEFAULT false,
  user_override_reason text,
  applied_in jsonb DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX mistake_memory_rules_public_id_uidx ON mistake_memory_rules (public_id);
CREATE INDEX mistake_memory_rules_tenant_idx ON mistake_memory_rules (tenant_id);
CREATE INDEX mistake_memory_rules_application_idx ON mistake_memory_rules (application_id);

-- Final QA
CREATE TABLE final_qa_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  resume_version_id uuid REFERENCES resume_versions (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  passed boolean,
  workflow_run_id uuid,
  prompt_version text,
  version integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX final_qa_runs_public_id_uidx ON final_qa_runs (public_id);
CREATE INDEX final_qa_runs_tenant_idx ON final_qa_runs (tenant_id);
CREATE INDEX final_qa_runs_application_idx ON final_qa_runs (application_id);

CREATE TABLE final_qa_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  final_qa_run_id uuid NOT NULL REFERENCES final_qa_runs (id) ON DELETE CASCADE,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX final_qa_checks_public_id_uidx ON final_qa_checks (public_id);
CREATE INDEX final_qa_checks_tenant_idx ON final_qa_checks (tenant_id);
CREATE INDEX final_qa_checks_run_idx ON final_qa_checks (final_qa_run_id);

-- Interviews
CREATE TABLE interview_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications (id) ON DELETE SET NULL,
  mode text NOT NULL,
  status text NOT NULL DEFAULT 'setup',
  difficulty text DEFAULT 'medium',
  duration_minutes integer DEFAULT 30,
  interviewer_persona text,
  voice_mode boolean NOT NULL DEFAULT false,
  resume_version_id uuid REFERENCES resume_versions (id) ON DELETE SET NULL,
  current_question_index integer NOT NULL DEFAULT 0,
  readiness_score integer DEFAULT 0,
  recording_consent boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  ended_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX interview_sessions_public_id_uidx ON interview_sessions (public_id);
CREATE INDEX interview_sessions_tenant_idx ON interview_sessions (tenant_id);
CREATE INDEX interview_sessions_application_idx ON interview_sessions (application_id);

CREATE TABLE interview_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES interview_sessions (id) ON DELETE CASCADE,
  prompt text NOT NULL,
  type text NOT NULL,
  competency text,
  evidence_cue_ids jsonb DEFAULT '[]'::jsonb,
  hint text,
  follow_up text,
  "order" integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX interview_questions_public_id_uidx ON interview_questions (public_id);
CREATE INDEX interview_questions_tenant_idx ON interview_questions (tenant_id);
CREATE INDEX interview_questions_session_idx ON interview_questions (session_id);

CREATE TABLE interview_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES interview_sessions (id) ON DELETE CASCADE,
  question_id uuid REFERENCES interview_questions (id) ON DELETE SET NULL,
  role text NOT NULL,
  text text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX interview_responses_public_id_uidx ON interview_responses (public_id);
CREATE INDEX interview_responses_tenant_idx ON interview_responses (tenant_id);
CREATE INDEX interview_responses_session_idx ON interview_responses (session_id);

CREATE TABLE interview_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES interview_sessions (id) ON DELETE CASCADE,
  overall integer NOT NULL DEFAULT 0,
  structure integer DEFAULT 0,
  relevance integer DEFAULT 0,
  technical_depth integer DEFAULT 0,
  evidence_usage integer DEFAULT 0,
  concision integer DEFAULT 0,
  clarity integer DEFAULT 0,
  pacing integer DEFAULT 0,
  filler_trend text,
  strongest_answer text,
  weakest_answer text,
  missed_evidence jsonb DEFAULT '[]'::jsonb,
  follow_up_risk text,
  practice_plan jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX interview_feedback_public_id_uidx ON interview_feedback (public_id);
CREATE UNIQUE INDEX interview_feedback_session_uidx ON interview_feedback (session_id);
CREATE INDEX interview_feedback_tenant_idx ON interview_feedback (tenant_id);

-- Files
CREATE TABLE stored_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  purpose text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL DEFAULT 0,
  checksum text,
  scan_status text NOT NULL DEFAULT 'pending',
  retention_state text NOT NULL DEFAULT 'active',
  original_filename text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX stored_files_public_id_uidx ON stored_files (public_id);
CREATE UNIQUE INDEX stored_files_storage_key_uidx ON stored_files (storage_key);
CREATE INDEX stored_files_tenant_idx ON stored_files (tenant_id);

-- Workflows
CREATE TABLE workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  stage workflow_stage NOT NULL,
  status workflow_run_status NOT NULL DEFAULT 'queued',
  attempt integer NOT NULL DEFAULT 1,
  idempotency_key text NOT NULL,
  input_version text,
  output_version text,
  provider text,
  model text,
  prompt_version text,
  token_usage jsonb,
  estimated_cost_cents numeric(18, 4),
  error_class text,
  retry_status text,
  trace_id text,
  started_at timestamptz,
  completed_at timestamptz,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workflow_runs_public_id_uidx ON workflow_runs (public_id);
CREATE UNIQUE INDEX workflow_runs_tenant_idempotency_uidx ON workflow_runs (tenant_id, idempotency_key);
CREATE INDEX workflow_runs_tenant_idx ON workflow_runs (tenant_id);
CREATE INDEX workflow_runs_application_idx ON workflow_runs (application_id);
CREATE INDEX workflow_runs_status_idx ON workflow_runs (status);

CREATE TABLE workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  workflow_run_id uuid NOT NULL REFERENCES workflow_runs (id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications (id) ON DELETE CASCADE,
  stage workflow_stage NOT NULL,
  status text NOT NULL,
  message text,
  seq integer NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workflow_events_public_id_uidx ON workflow_events (public_id);
CREATE UNIQUE INDEX workflow_events_run_seq_uidx ON workflow_events (workflow_run_id, seq);
CREATE INDEX workflow_events_tenant_idx ON workflow_events (tenant_id);
CREATE INDEX workflow_events_application_idx ON workflow_events (application_id);

-- Usage (append-only), notifications, audit logs, outbox, idempotency
CREATE TABLE usage_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  kind usage_kind NOT NULL,
  units numeric(18, 6) NOT NULL DEFAULT 0,
  cost_cents numeric(18, 4) NOT NULL DEFAULT 0,
  workflow_run_id uuid REFERENCES workflow_runs (id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usage_ledger_public_id_uidx ON usage_ledger (public_id);
CREATE UNIQUE INDEX usage_ledger_idempotency_uidx ON usage_ledger (idempotency_key);
CREATE INDEX usage_ledger_tenant_idx ON usage_ledger (tenant_id);
CREATE INDEX usage_ledger_created_idx ON usage_ledger (created_at);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  href text,
  tone text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX notifications_public_id_uidx ON notifications (public_id);
CREATE INDEX notifications_tenant_idx ON notifications (tenant_id);
CREATE INDEX notifications_user_idx ON notifications (user_id);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid REFERENCES tenants (id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  request_id text,
  ip text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX audit_logs_public_id_uidx ON audit_logs (public_id);
CREATE INDEX audit_logs_tenant_idx ON audit_logs (tenant_id);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at);

CREATE TABLE outbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid REFERENCES tenants (id) ON DELETE SET NULL,
  topic text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status outbox_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX outbox_messages_public_id_uidx ON outbox_messages (public_id);
CREATE INDEX outbox_messages_status_available_idx ON outbox_messages (status, available_at);
CREATE INDEX outbox_messages_tenant_idx ON outbox_messages (tenant_id);

CREATE TABLE idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  key text NOT NULL,
  scope text NOT NULL,
  request_hash text,
  response_status integer,
  response_body jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idempotency_keys_public_id_uidx ON idempotency_keys (public_id);
CREATE UNIQUE INDEX idempotency_keys_tenant_scope_key_uidx ON idempotency_keys (tenant_id, scope, key);
CREATE INDEX idempotency_keys_tenant_idx ON idempotency_keys (tenant_id);

-- Deferred FK for applications.resume_id → resumes.id (circular create order)
ALTER TABLE applications
  ADD CONSTRAINT applications_resume_id_fkey
  FOREIGN KEY (resume_id) REFERENCES resumes (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Row Level Security stubs
-- App must: SET LOCAL app.tenant_id = '<tenant uuid>';
-- current_setting('app.tenant_id', true) returns NULL when unset (fail-closed).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION candidarc_current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'candidate_profiles',
    'job_descriptions',
    'applications',
    'research_runs',
    'research_sources',
    'research_findings',
    'evidence_items',
    'evidence_metrics',
    'evidence_attachments',
    'evidence_application_matches',
    'resumes',
    'resume_versions',
    'resume_sections',
    'resume_claims',
    'audit_runs',
    'audit_findings',
    'audit_decisions',
    'mistake_memory_rules',
    'final_qa_runs',
    'final_qa_checks',
    'interview_sessions',
    'interview_questions',
    'interview_responses',
    'interview_feedback',
    'stored_files',
    'workflow_runs',
    'workflow_events',
    'usage_ledger',
    'notifications',
    'idempotency_keys'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_select ON %I FOR SELECT USING (tenant_id = candidarc_current_tenant_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_insert ON %I FOR INSERT WITH CHECK (tenant_id = candidarc_current_tenant_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_update ON %I FOR UPDATE USING (tenant_id = candidarc_current_tenant_id()) WITH CHECK (tenant_id = candidarc_current_tenant_id())',
      tbl
    );
    EXECUTE format(
      'CREATE POLICY tenant_isolation_delete ON %I FOR DELETE USING (tenant_id = candidarc_current_tenant_id())',
      tbl
    );
  END LOOP;
END $$;

-- audit_logs / outbox_messages may be null-tenant (system); optional tenant filter when set
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_tenant_or_system ON audit_logs
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = candidarc_current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = candidarc_current_tenant_id());

ALTER TABLE outbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_messages_tenant_or_system ON outbox_messages
  FOR ALL
  USING (tenant_id IS NULL OR tenant_id = candidarc_current_tenant_id())
  WITH CHECK (tenant_id IS NULL OR tenant_id = candidarc_current_tenant_id());

COMMIT;
