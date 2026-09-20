# Single-request résumé generation

## Scope and baseline

Branch: `feat/single-request-resume`, based on PR #13 (`d81f5c3`). This PR depends on the unmerged team-research implementation. It does not deploy, merge, change prices, provision services or delete production data. Previous findings remain in `reviews/preserved-defects.md`.

## Runtime path

Both pasted/uploaded JD and Radar `tailorResume` reach `CustomerGenerateService.generate`. Reviewed candidate evidence and contact information are immutable content-addressed snapshots; JD/company/team inputs are a separate snapshot. Tenant + owner + snapshot hashes define the operation. Client retry nonces, matching metadata and timestamps do not mint another allowance. Changed reviewed facts/JD are a distinct operation, not a retry.

Next.js queues bounded public research and local FastAPI JD parsing. There is no paid research synthesis, evidence matching, shadow generation, HR/EM audit, V1–V4 rewrite or final AI review on this new path. Candidate facts and source excerpts are supplied to the initial generation request. The existing classic template and PDF/DOCX renderers remain authoritative.

FastAPI reuses the shared PostgreSQL evidence pool. Migration 0018's tenant/owner primary key and `SELECT ... FOR UPDATE` consume an allowance before dispatch. The state never resets or expires. The OpenAI SDK receives `max_retries=0`; the retry wrapper is bypassed. An uncertain result is never redispatched. This guarantees at most one dispatch by this application, not exactly-once execution at the external provider.

A structured response and usage are persisted before local assembly/validation. A worker retry can retrieve that response, validate it and render it. Invalid JSON/no response can consume the allowance without yielding a document; this is reported honestly. If factual checks fail, repeated unchanged retries are rejected. A missing response after an uncertain dispatch needs provider reconciliation/support, not a new request with a random nonce.

Local assembly restores reviewed company/title/location/date, education, project, certification and publication fields. Local repairs normalize whitespace and remove exact duplicate bullets with the same evidence. Pattern-based factual checks and writing scores are not a proof of semantic equivalence. No trained local generative model or usable weights were found: the optional cross-encoder is a ranker. Free-form rewriting is unavailable and preserves the previous document. A future local generator needs a versioned model/runtime, source-grounded evaluation, latency/memory budgets and per-output validation before enabling edits. Resume copilot answers use local saved facts; they cannot call a paid critic.

The customer sees research, generation, local checking and existing downloads. Removed audits are not reported as performed. Historical documents are preserved. Queue handlers pause legacy customer workflows for review instead of resuming their paid stages. Low-level legacy tests and service endpoints remain for historical compatibility, not as an active customer generation route.

## Reuse and resource controls

- Profile and JD snapshots are referenced by operations; only meaningful new inputs create another operation/version.
- The immutable evidence sync does one owner-scoped list instead of one lookup per career entry. Unchanged embeddings are reused by content (including metric chunks), embedding model and dimensions.
- Research snapshots are scoped by tenant/owner/company/team/role/JD, mode/configuration and a 15-minute freshness window. Candidate strategy is not cached across candidates. Search/page work is bounded to three searches, three results per search, eight direct URLs, eight retained sources, three concurrent page fetches, 500 KB per page, 300 KB per search response, 12,000 characters per excerpt and a 20-second overall deadline. Interrupted durable collection is not automatically re-searched. This cache intentionally prioritizes isolation over cross-tenant reuse.
- Search attempts are metered separately; a pre-dispatch reservation can overcount if a process dies before sending. Cost remains estimated, not an invoice or customer charge.
- Export identity includes tenant/owner, immutable version/content, candidate/contact, permanent template, renderer version and format. File IDs and object keys are deterministic; upload checksums and metadata can recover from an interrupted write. Format leases and per-application publication leases prevent concurrent rendering/publication. Increment the renderer version for any output-affecting change.
- Both formats are pre-generated because the current product promises PDF and Word downloads at completion. Subsequent downloads reuse bytes; only a failed format retries. Original uploaded bytes are deduplicated by server-calculated checksum + owner + MIME. Explicit re-imports have separate parse attempts while keeping confirmed baselines.
- Storage remains private and separate from metadata. Generic file download/delete now checks ownership, not just tenant membership. `config/r2.env.example` prepares the existing S3 adapter; no bucket, credentials, migration or purchase was made.
- Default maximums: 5 connections per Node process and 5 per Python process. One web + two workers + one Python process reserves up to 20, plus operator/migration/headroom. Count replicas before choosing the real budget. Tenant context still uses transaction-local `set_config`.
- Redis/durable queues, backups and history remain. These changes reduce requests, retained duplicates and future growth; they do not automatically reduce a fixed PostgreSQL/compute bill.

## Retention and measurement

`npx tsx scripts/storage-retention-report.ts <tenant UUID> <owner UUID>` is a read-only report of at most 100 file rows. Only unreferenced explicitly temporary render files older than 7 days or abandoned upload parts older than 30 days are marked for operator review. Originals, finals, recovery references and unknown categories are retained. It has no apply/delete mode and does not authorize production cleanup. Unregistered objects require an object-inventory reconciliation before any later deletion.

`npx tsx scripts/database-cost-report.ts [tenant owner operation]` reports table/index bytes, estimated rows, connection counts and optionally a point-lookup EXPLAIN. No production database was accessible here; no production query plan, size or tier saving is claimed. The primary key serves exact operation/lease lookups; the sole new secondary index serves bounded owner/kind/time inventory. No speculative index drops.

Token usage has one monetary provider-cost ledger entry. Token/local/search/render rows are informational and do not add a second customer charge. Unknown provider cost is distinct from known zero. Local validation records wall/CPU time and process peak RSS; peak RSS is process-wide, platform-native units, not per-request allocation. Render wall time and output bytes are recorded; Chromium CPU/RSS and real shared infrastructure invoices require deployment measurement. No live paid evaluation was run; existing live tests remain opt-in with call/token/USD caps.

## Migration and rollout

1. Back up PostgreSQL and verify restore capability using existing procedures. Apply `CANDIDARC_DATA_MODE=postgres npm run db:migrate` before starting new workers/FastAPI. Migration 0018 is expand-only; existing tables/versions are untouched.
2. Deploy compatible web, worker and FastAPI code together in staging. Use the shared PostgreSQL URL, `EVIDENCE_STORE=postgres`, existing Redis/BullMQ and private object storage for live AI. Memory mode supports mock demos only; live one-request allowance fails closed without PostgreSQL. `/health/ready` verifies the allowance table.
3. Keep the generation OpenAI key/model configured. New generation needs no Anthropic audit key or separate final-review key. Leave old secrets in the secret manager until historical support requirements are reviewed; no credentials are printed or copied by this change.
4. Run required CI, then verify one real candidate operation per entry point with an explicitly budgeted live test. Inspect token/provider IDs, one dispatch, isolated citations, factual writing quality, contact fields, PDF text and Word content. Simulate a timeout, worker restart and format-only failure.
5. Check paused legacy runs, recover their saved versions/responses, and tell affected users what remains unavailable. Never reset an allowance to resume an old operation.

Rollback: stop new submissions and generation consumers first. Preserve 0018 data, originals, output files, billing and operation history. Do not run old paid pipeline workers on new operation payloads. Drain/pause those jobs and retain the single-request dispatcher guard until recovery is complete. Then roll back presentation/local code if necessary. Dropping 0018 or changing policy/operation identity to retry is not a safe rollback.

## Verification record

Focused tests cover JD/Radar entry points, saved-response recovery, concurrent allowances, SDK retries disabled, changed-input rejection, missing local model, facts/links, export identity/reuse, upload reuse, owner isolation, protected retention and the existing template. PostgreSQL tests are mandatory in CI (the local workspace has no PostgreSQL/Docker service). Final command counts and CI links are recorded in the PR after validation; mock success is not live-provider quality evidence.
