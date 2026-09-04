# Architecture Decision Records

## ADR-001: Modular monolith

**Decision:** Keep web, API modules, and workers in one repository with clear module boundaries, not microservices.

**Why:** The product is early. A modular monolith preserves transactional integrity for resume versioning, audits, and usage accounting while allowing independent process scaling later.

## ADR-002: Separately deployable workers

**Decision:** Long-running AI, research, PDF, and transcription work runs in a worker process (`npm run worker`), never inside Next.js request handlers.

**Why:** Request timeouts, horizontal web scaling, and cost control require async execution with durable state.

## ADR-003: PostgreSQL as system of record

**Decision:** PostgreSQL (with optional `pgvector`) is authoritative for tenants, applications, resumes, audits, workflows, and usage.

**Why:** Strong consistency, RLS hooks, relational provenance, and mature ops. Memory mode exists only for local/demo.

## ADR-004: Object storage for files

**Decision:** Uploads, PDFs, and recordings live in S3-compatible (or local filesystem) storage; the database stores metadata only.

**Why:** Blobs in Postgres do not scale; signed URLs and retention policies require object storage.

## ADR-005: AI provider abstraction

**Decision:** Business modules call `GenerationProvider` interfaces; mock provider is default locally.

**Why:** Prevents SDK lock-in, enables deterministic tests, centralizes cost/token capture and prompt versioning.

## ADR-006: Durable workflow orchestration

**Decision:** Workflow state is persisted in `workflow_runs` / `workflow_events` with idempotency keys. Engine interface can later bind to Temporal (`WORKFLOW_ENGINE=temporal`).

**Why:** Resume after crash, prevent duplicate versions/charges, support human-review pauses. Temporal is optional production upgrade, not a local requirement.

## ADR-007: Multi-tenant authorization

**Decision:** Derive tenant access from authenticated user + membership. Never trust client `tenant_id`. Enforce in guards + repositories; SQL migration includes RLS stubs for postgres mode.

## ADR-008: Prompt and rubric versioning

**Decision:** Prompts live in `server/ai/prompt-registry.ts` with id/version/rubricVersion recorded on every generation.

## ADR-009: Usage accounting

**Decision:** Append-only `usage_ledger` with idempotency keys; reserve/commit/release around expensive jobs.

## ADR-010: Future extraction criteria

Extract a module only when it has independent scaling, failure, or compliance needs. Likely candidates:

- Realtime interview / transcription
- Document rendering
- Research ingestion
- AI execution fleet
- Notifications

Do not extract until operational evidence requires it.
