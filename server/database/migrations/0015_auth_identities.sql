-- Expand-only: external auth provider identities (Google OIDC).
-- Unique (provider, provider_subject) guarantees one CandidArc user per Google sub.
-- Unique (user_id, provider) guarantees at most one Google identity per user.

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_nonempty CHECK (char_length(trim(provider)) > 0),
  CONSTRAINT auth_identities_subject_nonempty CHECK (char_length(trim(provider_subject)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_provider_subject_uidx
  ON auth_identities (provider, provider_subject);

CREATE UNIQUE INDEX IF NOT EXISTS auth_identities_user_provider_uidx
  ON auth_identities (user_id, provider);

CREATE INDEX IF NOT EXISTS auth_identities_user_idx
  ON auth_identities (user_id);

CREATE INDEX IF NOT EXISTS auth_identities_email_idx
  ON auth_identities (lower(email));
