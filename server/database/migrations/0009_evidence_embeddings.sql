-- Evidence embedding documents/chunks for Python resume-intelligence (pgvector).
-- Drizzle/TypeScript owns this migration; Python must not silently invent schema in production.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS evidence_documents (
  document_id text NOT NULL,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  source_type text NOT NULL,
  source_identifier text NOT NULL,
  source_span text,
  content_hash text NOT NULL,
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, owner_user_id, document_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS evidence_documents_content_hash_uidx
  ON evidence_documents (tenant_id, owner_user_id, source_type, source_identifier, content_hash);

CREATE INDEX IF NOT EXISTS evidence_documents_tenant_owner_idx
  ON evidence_documents (tenant_id, owner_user_id);

CREATE TABLE IF NOT EXISTS evidence_chunks (
  chunk_id text PRIMARY KEY,
  document_id text NOT NULL,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  source_type text NOT NULL,
  source_identifier text NOT NULL,
  source_span text,
  content_hash text NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1536),
  embedding_model text NOT NULL,
  embedding_dimensions integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_chunks_document_fk
    FOREIGN KEY (tenant_id, owner_user_id, document_id)
    REFERENCES evidence_documents (tenant_id, owner_user_id, document_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS evidence_chunks_owner_idx
  ON evidence_chunks (tenant_id, owner_user_id);

CREATE INDEX IF NOT EXISTS evidence_chunks_document_idx
  ON evidence_chunks (tenant_id, owner_user_id, document_id);

-- IVFFlat requires data; use HNSW when available (pgvector 0.5+). Fall back safely if unsupported.
DO $$
BEGIN
  BEGIN
    CREATE INDEX IF NOT EXISTS evidence_chunks_embedding_hnsw_idx
      ON evidence_chunks
      USING hnsw (embedding vector_cosine_ops);
  EXCEPTION
    WHEN undefined_object OR feature_not_supported OR invalid_parameter_value THEN
      -- Older pgvector builds: skip vector index; sequential scan remains correct and tenant-filtered.
      NULL;
  END;
END $$;
