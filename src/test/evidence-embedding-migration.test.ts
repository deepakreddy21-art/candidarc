/** @vitest-environment node */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("evidence embedding migration 0009", () => {
  it("enables pgvector and creates tenant-scoped document/chunk tables", () => {
    const sql = readFileSync(
      path.resolve(process.cwd(), "server/database/migrations/0009_evidence_embeddings.sql"),
      "utf8",
    );
    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS evidence_documents");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS evidence_chunks");
    expect(sql).toContain("ON DELETE CASCADE");
    expect(sql).toContain("tenant_id");
    expect(sql).toContain("owner_user_id");
    expect(sql).toContain("content_hash");
    expect(sql).toContain("embedding vector(1536)");
  });
});
