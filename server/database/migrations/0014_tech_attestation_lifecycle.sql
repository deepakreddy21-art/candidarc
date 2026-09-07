-- Expand-only lifecycle support for application-scoped technology attestations.
-- A git revert does not roll back this database migration; use a forward migration.
ALTER TABLE evidence_items
  ADD COLUMN IF NOT EXISTS attestation_application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS normalized_technology text;

-- Prefer the application encoded in the legacy confirmation key.
UPDATE evidence_items AS evidence
SET attestation_application_id = app.id
FROM applications AS app
WHERE evidence.source_type = 'user_confirmation'
  AND evidence.attestation_application_id IS NULL
  AND evidence.tenant_id = app.tenant_id
  AND split_part(evidence.payload->>'techConfirmationKey', ':', 2) = app.public_id;

-- Fall back to an unambiguous existing application match.
UPDATE evidence_items AS evidence
SET attestation_application_id = matched.application_id
FROM (
  SELECT evidence_item_id,
         (array_agg(application_id ORDER BY application_id))[1] AS application_id
  FROM evidence_application_matches
  WHERE deleted_at IS NULL AND excluded = false
  GROUP BY evidence_item_id
  HAVING count(DISTINCT application_id) = 1
) AS matched
WHERE evidence.id = matched.evidence_item_id
  AND evidence.source_type = 'user_confirmation'
  AND evidence.attestation_application_id IS NULL;

-- Legacy keys are authoritative when present; otherwise use the first technology.
UPDATE evidence_items
SET normalized_technology = lower(btrim(
  COALESCE(
    NULLIF(split_part(payload->>'techConfirmationKey', ':', 3), ''),
    NULLIF((technologies -> 0) #>> '{}', '')
  )
))
WHERE source_type = 'user_confirmation'
  AND normalized_technology IS NULL
  AND (
    NULLIF(split_part(payload->>'techConfirmationKey', ':', 3), '') IS NOT NULL
    OR NULLIF((technologies -> 0) #>> '{}', '') IS NOT NULL
  );

-- Keep only the latest active legacy answer for each lifecycle identity.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY tenant_id, owner_user_id, attestation_application_id, normalized_technology
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS answer_rank
  FROM evidence_items
  WHERE deleted_at IS NULL
    AND evidence_status = 'active'
    AND source_type = 'user_confirmation'
    AND attestation_application_id IS NOT NULL
    AND normalized_technology IS NOT NULL
)
UPDATE evidence_items AS evidence
SET evidence_status = 'revoked',
    updated_at = now()
FROM ranked
WHERE evidence.id = ranked.id
  AND ranked.answer_rank > 1;

CREATE INDEX IF NOT EXISTS evidence_items_attestation_application_idx
  ON evidence_items (tenant_id, attestation_application_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS evidence_items_active_tech_attestation_uidx
  ON evidence_items (tenant_id, owner_user_id, attestation_application_id, normalized_technology)
  WHERE deleted_at IS NULL
    AND evidence_status = 'active'
    AND source_type = 'user_confirmation'
    AND attestation_application_id IS NOT NULL
    AND normalized_technology IS NOT NULL;
