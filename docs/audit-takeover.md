# Candidate trust and workflow repair

Baseline: `c2b8ad5d2eeb21bed15d6ce2646a32ec4a1f0088` on master.
Work is isolated on `fix/candidate-trust-and-workflow`. Existing worktrees, files, and branches were preserved. No merge or deployment is part of this repair.

## Implemented

- Review corrections are authoritative. Omitted fields remain unchanged; explicit empty values clear. Name/contact/summary, school/institution, certificate dates and removal, and all accepted skills round-trip consistently.
- The client sends changed fields against a versioned baseline. Onboarding and Profile serialize saves and preserve unsaved edits on conflicts. Import status includes profile, extraction, and version from one snapshot. Onboarding load failures block blank edits and offer Retry, which restores the saved step and preferences. Confirmation accepts `expectedVersion`; the legacy extraction PATCH now requires it and validates career field shapes/limits.
- Original parse output is retained separately as `sourceExtraction`. Upload replacement, parsing, failure restoration, and confirmation use the profile CAS path. A late/duplicate worker cannot overwrite a reviewed draft. Failed replacements preserve the confirmed baseline.
- Complete review controls cover employment dates/location/current role, projects, education, certifications, and publications. Duplicate read-only role cards were replaced by one editable section. Name, email, phone and current location are required for V3 onboarding; optional links remain optional. Current location is separate from desired work locations.
- Reviewed career evidence is immutable and keyed to the career revision. New tailoring selects the current revision, while an existing application keeps its evidence revision. An unconfirmed replacement does not become the new tailoring input. Radar evidence is owner-scoped within a tenant.
- Research no longer submits `search://` placeholders or failure messages as employer findings. Optional Brave search retrieves bounded HTTP sources through SSRF-protected fetches. Search credentials never go to result pages. General public references remain inferred; discovery time is not labeled publication time. No sourced employer finding is automatically a candidate claim.
- Greenhouse, Lever and Ashby have real public-board fetch/listing-verification paths. Production failures do not fall back to fixtures. Board ingestion writes through the Radar service before acknowledging ingestion. A bounded operator CLI enqueues chosen boards.
- Matching respects workplace/job-type/sponsorship/pay mismatches, distinguishes unknown compensation and eligibility, and uses explicit company/industry/relocation preferences. Salary ranges no longer concatenate their digits. Matching remains a heuristic, not a hiring probability.
- Applications no longer claim a resume is ready because of a high score. Capitalization does not classify common technologies as proprietary, and an overall fit score does not establish individual technology transferability.
- Compare loads an authorized, checked historical version and displays changed sections alongside the current document. Internal draft versions and another owner's versions cannot be fetched through the new endpoint. Resume polling is single-flight, bounded, cancellation-safe and pauses while the tab is hidden. Connection errors provide Retry.
- Failed workflow handlers atomically release only their own token-bearing stage lease so queue retries can execute without erasing another worker's claim or checkpoint. PostgreSQL tests separately exercise an in-flight provider, abandoned leases, and concurrent conditional release. Non-retryable validation errors reach a terminal result promptly. A no-change refinement restores the previous checked downloads with an explicit notice; it does not invent a new successful version. Refinement runs cannot overlap, and repeated instructions are not re-applied at every audit stage. Scan retries resume queue delivery, while late parser failures preserve reviewed results.
- The approved light green hero and ATS v1 template remain. Success/warning text is darker for contrast. Homepage dialogs use focus-trapping primitives with focus return. Profile identity remains usable if its import status service fails.

## Live configuration

`BRAVE_SEARCH_API_KEY` is optional and server-only. In live research, `priority` and `deep-team` depths enable search if that key exists. Missing/failed search returns only successfully retrieved sources, or no sources. This is an initial retrieval adapter; real source relevance and team attribution need live validation. See the [Brave API documentation](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started).

With the existing production environment configured (`APP_MODE=production`, PostgreSQL, Redis, storage and required secrets), start the ingestion worker and enqueue a known public board:

```sh
npm run worker:ingestion
# In another terminal, replace the identifiers with a verified public employer board:
npm run radar:ingest -- greenhouse BOARD_TOKEN Company Name
npm run radar:ingest -- lever BOARD_TOKEN Company Name
npm run radar:ingest -- ashby BOARD_TOKEN Company Name
```

The CLI acknowledges durable queueing, not completed ingestion. Inspect worker completion/errors and saved jobs before declaring the source healthy. Repeated enqueueing within the same hour is idempotent. There is no automatic employer-discovery or periodic crawl schedule in this change. Demo mode continues to use labeled fixtures. LinkedIn/Indeed licensed integrations are not implemented by this PR.

Public API references: [Greenhouse](https://developers.greenhouse.io/job-board.html), [Lever](https://github.com/lever/postings-api), [Ashby](https://developers.ashbyhq.com/docs/public-job-posting-api).

## Verification

Local verification: 454 unit tests passed (6 existing environment/intentional skips), 201 Python tests passed (5 non-live environment skips), and 4 production-journey tests passed. Lint has no errors and 7 existing warnings; TypeScript checking, the production build, generated-contract comparison, and Python cutover verification pass. The previously skipped built-app refinement/comparison journey and the new no-change/download recovery journey both pass. Broader browser and remote CI results are recorded in the PR. Local browser tests use a production Next build, real FastAPI parsing, synthetic PDF/DOCX fixtures, memory persistence, in-process queues, and mock AI. They do not prove paid-provider output, production database durability or a live Google sign-in. The repository's PostgreSQL/Redis/Docker gates run separately in CI.

Regression cases cover corrections/deletions after reload, stale confirmation, original-source preservation, immutable evidence revisions, same-tenant owner isolation, real-source failure handling, no live fixture substitution, preference mismatches, historical-version authorization, actual comparison, independent PDF/DOCX content and recovery controls. The built-app refine/comparison test is enabled instead of its prior skip.

No new dependencies or database migrations were introduced. Local development environments and generated test reports are not source deliverables. Removed code is limited to replaced duplicate review rendering, obsolete merge rules, unused modal state, and placeholder/fallback implementations; source-line changes are not a claim of lower runtime memory.

## Remaining product and launch work

This implements the audit's data/trust foundation and bounded workflow improvements. It does not claim every roadmap feature is complete or every future resume will parse perfectly.

- Validate an anonymized, permissioned real-resume corpus and paid-provider runs. OCR remains explicitly unsupported. Add source-excerpt review, reorder/undo/merge-split, direct document editing and restore-as-new-version as separate document-workspace work.
- Validate a real employer board cohort, company/team relevance, posting freshness and production restart persistence. Configure a bounded ingestion schedule after that validation.
- Extend Applications with exact sent-package tracking, status history, reminders and CSV export without duplicating the existing notes/follow-up workspace.
- Complete account recovery, authenticated Google linking, retention/deletion lifecycle, provider-data policy, support and privacy-safe production telemetry. These are still launch requirements, not implemented capabilities.
- Validate OAuth with real accounts, deployment backup/restore, billing/cancellation/credits before charging, and the live provider cost ledger.
- Record a real product walkthrough once the candidate journey is stable; complete the public support/privacy/terms/pricing/SEO pages with approved business details. Keep the approved brand and avoid another broad visual rewrite.

Revert the feature commits to roll back code; no destructive migration is required. Profile edits and immutable evidence created while this code runs remain candidate data and must not be deleted as part of rollback.

## Import layout correction (merge paused)

The additional UAT screenshots exposed deterministic parsing defects: combined employer/title/location text became a job title; each education line became a separate school; unrecognized project headings continued the education section. PDF reconstruction also treated right-aligned dates as independent columns, and DOCX parsing omitted tables.

The parser now groups employment, education and project lines into records before assigning fields. It recognizes additional standalone/inline section aliases, supports employer-first/title-first headers, preserves wrapped responsibilities, separates degree/major/institution/location/dates, and retains distinct promotions under an explicitly shared employer. Location recognition uses record context and Unicode place syntax, not a fixed list of US cities. Institution recognition combines record context with structural cues; acronym institutions are not expanded into guessed names.

PDF reading preserves horizontal layout for row-based headers, requires independent right-hand section headings before using column-major reading, and applies text transformation matrices. DOCX reading includes ordered paragraphs/tables, merged cells, native bullet/numbered lists, and header contact text. Source excerpts and uncertainty warnings survive in record provenance; unresolved records lower extraction quality and contribute to the existing review indicators. These repairs do not call an AI provider and require no AI key or new dependency.

Verification for this correction:

- 70 new layout regression cases, including positioned PDF objects, DOCX tables/native lists, international locations, alternate headings, combined headers and multiline degrees.
- 271 Python tests pass, with the same 5 environment-dependent skips.
- 12 real-FastAPI upload/scan/extract/confirm/reload journey tests pass, including new PDF and DOCX field-level checks.
- 4 built-app browser import tests pass with retries disabled, including visible field assertions before and after confirmation/reload. The hosted runner uses its installed Chromium binary and explicit loopback binding; video capture is unavailable locally, while traces remain enabled. CI uses the repository's normal browser configuration.
- TypeScript checking, changed-file ESLint, Ruff, mypy and diff whitespace checks pass.
- The earlier user-supplied PDF was inspected locally and still returns 3 roles/companies, 2 education entries and 12/12/10 responsibility bullets. The private document and its contact details were not added to Git; committed fixtures are synthetic.

The newer screenshot template's original PDF/DOCX has not been supplied in this session. Its observed failure is reproduced using synthetic text/layout twins, not claimed as verification of the exact source document. Existing confirmed profiles are not rewritten: replace/re-import, review and confirm to adopt new parsing. Arbitrary ambiguous layouts, unknown headings and image-only PDFs remain limitations; no rule-based or model-based extractor can promise perfect results on every document. A future optional model fallback should use schema-constrained extraction, per-field source verification, bounded time/cost, and explicit uncertainty—not fill missing candidate facts from general knowledge.

References: [pypdf text extraction and layout limitations](https://pypdf.readthedocs.io/en/stable/user/extract-text.html), [python-docx document content ordering](https://python-docx.readthedocs.io/en/latest/api/document.html).
