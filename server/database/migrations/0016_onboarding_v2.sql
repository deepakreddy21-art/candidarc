-- Onboarding V2 preference fields for Job Radar filtering and career direction.
ALTER TABLE candidate_profiles
  ADD COLUMN IF NOT EXISTS target_companies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS target_industries jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS job_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS workplace_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS willing_to_relocate boolean,
  ADD COLUMN IF NOT EXISTS salary_preference text,
  ADD COLUMN IF NOT EXISTS seniority text;
