# Company and team research in résumé tailoring

Both pasted job descriptions and Radar's Tailor action use `CustomerGenerateService` and the same Python résumé pipeline. New customer workflows default to `deep-team`. Radar passes the job's department; explicit team/product/business-unit fields and named JD headings add context. Unknown team identity stays unknown.

## Execution

1. Save the job and start the durable workflow. The existing progress view appears immediately.
2. Fetch the supplied public job URL and run three role/team-specific Brave searches. Search receives company/role/team context, not the candidate's résumé. The collector allows 20 seconds overall, 8 seconds per search and 5 seconds per result page, with at most eight deduplicated sources and 12,000 characters per source. SSRF restrictions apply to every URL and redirect; search credentials never reach result websites.
3. In live mode, the configured OpenAI generation provider analyzes retrieved excerpts. Each finding carries source quotations, scope, relationship, confidence, and a caveat. Exact quotation checks reject invented references. Company findings are not silently promoted to team findings. Offering a product or compatibility does not establish team stack usage. Undated, old, or conflicting material remains uncertain.
4. The existing request-scoped evidence matcher runs. One additional structured OpenAI call selects a focused résumé plan from the full saved, reviewed career evidence. Company research determines relevance; it does not supply candidate accomplishments. Plans retain candidate tool names, employers and project boundaries. Unsupported areas can appear as optional profile questions/interview preparation, never résumé claims.
5. Generation and subsequent résumé revisions receive the persisted plan. All four HR/EM audits, claim guardrails, natural-language meaning reviews and final QA remain enabled.
6. The progress and result views expose an expandable research/approach explanation, source links, publication/retrieval dates, limitations and relevant evidence priorities. Raw stored source text and internal candidate evidence IDs are not returned in this public DTO.

## Runtime configuration

- Web/worker: existing `AI_MODE=live`, plus `BRAVE_SEARCH_API_KEY` for public company/team search.
- Python: existing `AI_MODE=live` and the configured OpenAI generation credential/model. Existing Anthropic audit and final-review configuration remains necessary for the full live pipeline.
- `AI_MODE=mock` performs no live research and is explicitly labeled as demo mode. It is not a semantic-planning accuracy test.
- Missing search credentials, inaccessible sites or an exhausted collection budget produce a visible limitation; tailoring can still use the JD and career evidence. AI/provider failures retain the normal typed failure/retry behavior.

There are up to three search queries, one research analysis call when source material exists, and one planning call per new live workflow. Existing token/cost accounting records actual provider usage; unknown prices remain unknown. No fixed completion-time or universal stack claims are made.

## Retry, cache and data boundaries

The optional source cache has a 15-minute TTL, at most 100 entries, and includes tenant, owner, company, role, team/product/division, job URL/text and research policy version. Failed/unavailable collections are not cached as successes. A workflow saves its exact collection before synthesis so retries reuse timestamps and excerpts. Python research and planning requests have deterministic, owner-scoped idempotency keys using the existing durable idempotency store and lock renewal. Production durability still requires the repository's PostgreSQL/Redis configuration.

Personalized plans are persisted only on the owned application, never placed in the shared source cache. New generation identity includes the profile revision and explicit target identity, so changed evidence or team context does not reuse an older job's résumé. User-edited profile data remains the authority.

## Verification and limits

Tests cover team/company/product distinctions, date uncertainty, exact source and candidate quotations, wrong-owner evidence, invented citations, employer/project separation, real SDK request/usage mapping through mocked transport, retry replay, cache scope/expiry, missing search configuration and bounded collection. The orchestration test verifies the plan reaches initial generation and later revisions. Browser coverage checks the research explanation within the existing complete tailoring journey.

These tests prove contracts and enforcement, not real-provider semantic accuracy. A staging run with live search and paid providers should inspect a sparse JD, a clearly named team, a product-compatibility page, a non-engineering role and a research-outage case. Check retrieved references, candidate-only claims, source ages, recorded latency/cost and final PDF/DOCX content. Do not mark an inferred company-wide technology as a confirmed team technology.
