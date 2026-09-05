"""asyncpg + pgvector EvidenceStore implementation.

Tables (match TS migration naming): evidence_documents, evidence_chunks.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.errors import EVIDENCE_CROSS_TENANT, EVIDENCE_NOT_FOUND, EVIDENCE_STORE_UNAVAILABLE
from app.modules.evidence.store.protocol import (
    EvidenceChunkRecord,
    EvidenceDocumentRecord,
    EvidenceSearchResult,
    EvidenceStoreError,
)

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS evidence_documents (
    document_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_identifier TEXT NOT NULL,
    source_span TEXT NULL,
    content_hash TEXT NOT NULL,
    embedding_model TEXT NOT NULL,
    embedding_dimensions INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, owner_user_id, document_id)
);

CREATE TABLE IF NOT EXISTS evidence_chunks (
    chunk_id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_identifier TEXT NOT NULL,
    source_span TEXT NULL,
    content_hash TEXT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536),
    embedding_model TEXT NOT NULL,
    embedding_dimensions INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT evidence_chunks_document_fk
        FOREIGN KEY (tenant_id, owner_user_id, document_id)
        REFERENCES evidence_documents (tenant_id, owner_user_id, document_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS evidence_chunks_owner_idx
    ON evidence_chunks (tenant_id, owner_user_id);
"""


def _to_vector_literal(values: list[float]) -> str:
    return "[" + ",".join(f"{v:.8f}" for v in values) + "]"


def _parse_vector(value: Any) -> list[float]:
    if value is None:
        return []
    if isinstance(value, list):
        return [float(v) for v in value]
    text = str(value).strip()
    if text.startswith("[") and text.endswith("]"):
        text = text[1:-1]
    if not text:
        return []
    return [float(part) for part in text.split(",")]


class PostgresEvidenceStore:
    """Production evidence store backed by Postgres + pgvector."""

    def __init__(
        self,
        *,
        dsn: str,
        embedding_dimensions: int,
        statement_timeout_ms: int = 5_000,
        command_timeout: float = 10.0,
    ) -> None:
        self._dsn = dsn
        self._embedding_dimensions = embedding_dimensions
        self._statement_timeout_ms = statement_timeout_ms
        self._command_timeout = command_timeout
        self._pool: Any | None = None
        self._ready = False

    async def connect(self) -> None:
        try:
            import asyncpg
            from pgvector.asyncpg import register_vector
        except ImportError as exc:
            raise EvidenceStoreError(
                EVIDENCE_STORE_UNAVAILABLE,
                "asyncpg and pgvector packages are required for the postgres evidence store",
            ) from exc

        try:
            self._pool = await asyncpg.create_pool(
                dsn=self._dsn,
                min_size=1,
                max_size=5,
                command_timeout=self._command_timeout,
                timeout=self._command_timeout,
            )
            async with self._pool.acquire() as conn:
                await conn.execute(f"SET statement_timeout = {int(self._statement_timeout_ms)}")
                await conn.execute(SCHEMA_SQL)
                await register_vector(conn)
                # Ensure embedding column dimension matches config when possible
                await conn.execute(
                    f"""
                    DO $$
                    BEGIN
                      BEGIN
                        ALTER TABLE evidence_chunks
                          ALTER COLUMN embedding TYPE vector({self._embedding_dimensions});
                      EXCEPTION WHEN others THEN
                        NULL;
                      END;
                    END $$;
                    """
                )
            self._ready = True
        except EvidenceStoreError:
            raise
        except Exception as exc:  # noqa: BLE001
            self._ready = False
            raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, f"Postgres evidence store unavailable: {exc}") from exc

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
        self._ready = False

    def _require_pool(self) -> Any:
        if self._pool is None or not self._ready:
            raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, "Postgres evidence store is not connected")
        return self._pool

    async def upsert_document(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        document_id: str,
        source_type: str,
        source_identifier: str,
        source_span: str | None,
        content_hash: str,
        chunk_texts: list[str],
        embeddings: list[list[float]],
        embedding_model: str,
        embedding_dimensions: int,
    ) -> EvidenceDocumentRecord:
        if len(chunk_texts) != len(embeddings):
            raise ValueError("chunk_texts and embeddings length mismatch")
        pool = self._require_pool()
        now = datetime.now(UTC)
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    existing = await conn.fetchrow(
                        """
                        SELECT document_id, tenant_id, owner_user_id, source_type, source_identifier,
                               source_span, content_hash, embedding_model, embedding_dimensions,
                               created_at, updated_at
                        FROM evidence_documents
                        WHERE tenant_id = $1 AND owner_user_id = $2 AND document_id = $3
                        """,
                        tenant_id,
                        owner_user_id,
                        document_id,
                    )
                    if existing is not None:
                        if existing["tenant_id"] != tenant_id or existing["owner_user_id"] != owner_user_id:
                            raise EvidenceStoreError(EVIDENCE_CROSS_TENANT, "Evidence tenant/owner mismatch")
                        if (
                            existing["content_hash"] == content_hash
                            and int(existing["embedding_dimensions"]) == embedding_dimensions
                        ):
                            chunk_rows = await conn.fetch(
                                """
                                SELECT chunk_text FROM evidence_chunks
                                WHERE tenant_id = $1 AND owner_user_id = $2 AND document_id = $3
                                ORDER BY chunk_id
                                """,
                                tenant_id,
                                owner_user_id,
                                document_id,
                            )
                            return EvidenceDocumentRecord(
                                document_id=existing["document_id"],
                                tenant_id=existing["tenant_id"],
                                owner_user_id=existing["owner_user_id"],
                                source_type=existing["source_type"],
                                source_identifier=existing["source_identifier"],
                                source_span=existing["source_span"],
                                content_hash=existing["content_hash"],
                                chunk_texts=[row["chunk_text"] for row in chunk_rows],
                                embedding_model=existing["embedding_model"],
                                embedding_dimensions=int(existing["embedding_dimensions"]),
                                created_at=existing["created_at"],
                                updated_at=existing["updated_at"],
                            )

                    await conn.execute(
                        """
                        INSERT INTO evidence_documents (
                            document_id, tenant_id, owner_user_id, source_type, source_identifier,
                            source_span, content_hash, embedding_model, embedding_dimensions,
                            created_at, updated_at
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                        ON CONFLICT (tenant_id, owner_user_id, document_id) DO UPDATE SET
                            source_type = EXCLUDED.source_type,
                            source_identifier = EXCLUDED.source_identifier,
                            source_span = EXCLUDED.source_span,
                            content_hash = EXCLUDED.content_hash,
                            embedding_model = EXCLUDED.embedding_model,
                            embedding_dimensions = EXCLUDED.embedding_dimensions,
                            updated_at = EXCLUDED.updated_at
                        """,
                        document_id,
                        tenant_id,
                        owner_user_id,
                        source_type,
                        source_identifier,
                        source_span,
                        content_hash,
                        embedding_model,
                        embedding_dimensions,
                        existing["created_at"] if existing else now,
                        now,
                    )
                    await conn.execute(
                        """
                        DELETE FROM evidence_chunks
                        WHERE tenant_id = $1 AND owner_user_id = $2 AND document_id = $3
                        """,
                        tenant_id,
                        owner_user_id,
                        document_id,
                    )
                    for text, emb in zip(chunk_texts, embeddings, strict=True):
                        if len(emb) != embedding_dimensions:
                            raise ValueError("embedding dimension mismatch")
                        await conn.execute(
                            """
                            INSERT INTO evidence_chunks (
                                chunk_id, document_id, tenant_id, owner_user_id, source_type,
                                source_identifier, source_span, content_hash, chunk_text,
                                embedding, embedding_model, embedding_dimensions, created_at, updated_at
                            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,$13,$14)
                            """,
                            str(uuid4()),
                            document_id,
                            tenant_id,
                            owner_user_id,
                            source_type,
                            source_identifier,
                            source_span,
                            content_hash,
                            text,
                            _to_vector_literal(emb),
                            embedding_model,
                            embedding_dimensions,
                            now,
                            now,
                        )
            return EvidenceDocumentRecord(
                document_id=document_id,
                tenant_id=tenant_id,
                owner_user_id=owner_user_id,
                source_type=source_type,
                source_identifier=source_identifier,
                source_span=source_span,
                content_hash=content_hash,
                chunk_texts=list(chunk_texts),
                embedding_model=embedding_model,
                embedding_dimensions=embedding_dimensions,
                created_at=existing["created_at"] if existing else now,
                updated_at=now,
            )
        except EvidenceStoreError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, f"Upsert failed: {exc}") from exc

    async def delete_document(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        document_id: str,
    ) -> None:
        pool = self._require_pool()
        try:
            async with pool.acquire() as conn:
                result = await conn.execute(
                    """
                    DELETE FROM evidence_documents
                    WHERE tenant_id = $1 AND owner_user_id = $2 AND document_id = $3
                    """,
                    tenant_id,
                    owner_user_id,
                    document_id,
                )
            # asyncpg returns "DELETE N"
            if result.endswith("0"):
                raise EvidenceStoreError(EVIDENCE_NOT_FOUND, f"Document not found: {document_id}")
        except EvidenceStoreError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, f"Delete failed: {exc}") from exc

    async def search_similar(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        query_embedding: list[float],
        limit: int = 8,
    ) -> list[EvidenceSearchResult]:
        pool = self._require_pool()
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT chunk_id, document_id, tenant_id, owner_user_id, source_type,
                           source_identifier, source_span, content_hash, chunk_text,
                           embedding::text AS embedding, embedding_model, embedding_dimensions,
                           created_at, updated_at,
                           1 - (embedding <=> $3::vector) AS score
                    FROM evidence_chunks
                    WHERE tenant_id = $1 AND owner_user_id = $2
                    ORDER BY embedding <=> $3::vector
                    LIMIT $4
                    """,
                    tenant_id,
                    owner_user_id,
                    _to_vector_literal(query_embedding),
                    max(1, limit),
                )
            results: list[EvidenceSearchResult] = []
            for row in rows:
                chunk = EvidenceChunkRecord(
                    chunk_id=row["chunk_id"],
                    document_id=row["document_id"],
                    tenant_id=row["tenant_id"],
                    owner_user_id=row["owner_user_id"],
                    source_type=row["source_type"],
                    source_identifier=row["source_identifier"],
                    source_span=row["source_span"],
                    content_hash=row["content_hash"],
                    chunk_text=row["chunk_text"],
                    embedding=_parse_vector(row["embedding"]),
                    embedding_model=row["embedding_model"],
                    embedding_dimensions=int(row["embedding_dimensions"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                results.append(EvidenceSearchResult(chunk=chunk, score=float(row["score"] or 0.0)))
            return results
        except Exception as exc:  # noqa: BLE001
            raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, f"Search failed: {exc}") from exc

    async def list_by_owner(
        self,
        *,
        tenant_id: str,
        owner_user_id: str,
        limit: int = 100,
    ) -> list[EvidenceDocumentRecord]:
        pool = self._require_pool()
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    """
                    SELECT d.document_id, d.tenant_id, d.owner_user_id, d.source_type,
                           d.source_identifier, d.source_span, d.content_hash,
                           d.embedding_model, d.embedding_dimensions, d.created_at, d.updated_at,
                           COALESCE(
                             (SELECT array_agg(c.chunk_text ORDER BY c.chunk_id)
                              FROM evidence_chunks c
                              WHERE c.tenant_id = d.tenant_id
                                AND c.owner_user_id = d.owner_user_id
                                AND c.document_id = d.document_id),
                             ARRAY[]::text[]
                           ) AS chunk_texts
                    FROM evidence_documents d
                    WHERE d.tenant_id = $1 AND d.owner_user_id = $2
                    ORDER BY d.document_id
                    LIMIT $3
                    """,
                    tenant_id,
                    owner_user_id,
                    max(1, limit),
                )
            return [
                EvidenceDocumentRecord(
                    document_id=row["document_id"],
                    tenant_id=row["tenant_id"],
                    owner_user_id=row["owner_user_id"],
                    source_type=row["source_type"],
                    source_identifier=row["source_identifier"],
                    source_span=row["source_span"],
                    content_hash=row["content_hash"],
                    chunk_texts=list(row["chunk_texts"] or []),
                    embedding_model=row["embedding_model"],
                    embedding_dimensions=int(row["embedding_dimensions"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]
        except Exception as exc:  # noqa: BLE001
            raise EvidenceStoreError(EVIDENCE_STORE_UNAVAILABLE, f"List failed: {exc}") from exc

    async def health_check(self) -> bool:
        if self._pool is None:
            return False
        try:
            async with self._pool.acquire() as conn:
                await conn.fetchval("SELECT 1")
                has_vector = await conn.fetchval("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')")
                return bool(has_vector)
        except Exception:  # noqa: BLE001
            return False
