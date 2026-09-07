-- Forward-safe: applications.metadata used by Drizzle mappers; final_review used by Final QA usage reservations.
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TYPE usage_kind ADD VALUE IF NOT EXISTS 'final_review';
