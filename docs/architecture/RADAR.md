# CandidArc Radar

## Product promise

Find genuinely fresh opportunities, understand when a listing was actually created, and know whether a "new" job is only a repost.

CandidArc tracks appearances of a role across company sites and job platforms so candidates can separate fresh openings from recycled listings.

**Honest coverage language:** broad source coverage, company-direct discovery, multi-source job intelligence — not "every job on the internet."

## Production Posture

CandidArc Radar is designed for production deployment with truthful data handling:

### 1. No Auto-Seeding in Production
- `getSharedCatalog()` does NOT auto-seed demo data
- Demo catalog is only populated when `APP_MODE=demo`
- Production starts with an empty catalog until jobs are ingested
- `seedDemoCatalog()` must be called explicitly in demo/test mode

### 2. Truthful Candidate Profiles
- Matching uses `loadCandidateProfileForMatch()` which loads from the database
- `SEED_CANDIDATE_PROFILE` is NEVER used in production matching
- If no profile/evidence exists, returns `EMPTY_PROFILE` with zero skills
- Match scores honestly reflect incomplete profile data

### 3. Match Labels (Not Percentages)
- UI shows human-readable labels: "Strong match", "Good match", "Stretch opportunity", "Not recommended"
- Labels are backed by evidence-based reasons citing actual profile skills
- Internal scores remain for sorting but are not prominently displayed

### 4. Freshness Honesty
- `firstDiscoveredAt` is NEVER presented as original posting date
- `DATE_ONLY` precision never shows minute/hour precision
- Unknown original dates explicitly state "original posting date unknown"
- Composite statements like "Reposted X ago · originally posted Y" or "First discovered by CandidArc · original posting date unknown"

### 5. No Silent Fallbacks
- Production mode (`APP_MODE=production`) NEVER silently falls back to mock data
- API errors are surfaced to the user with Retry options
- `allowDemoFallback()` is only true when `APP_MODE=demo`

## Architecture

Shared catalog (not per-user crawls):

```text
Source ingestion → Raw sighting → Normalization → Canonical matching
→ Repost classification → Verification → Search index → User matching → Alerts
```

User-specific data stays tenant-isolated: saved searches, matches, hidden/saved jobs, alerts, application links.

### Persistence Layer

Two storage modes controlled by `CANDIDARC_DATA_MODE`:

| Mode | Description |
|------|-------------|
| `memory` | In-memory maps, suitable for demo with explicit seeding |
| `postgres` | Drizzle ORM with Postgres, includes FTS support |

Postgres mode provides:
- Full-text search with `tsvector` and GIN index
- Persistent saved/hidden jobs, alerts, searches
- Provider checkpoints for incremental ingestion
- Opportunity brief caching

### Hybrid Matching

1. **Stage 1**: Hard constraint filtering (location, salary, visa, etc.)
2. **Stage 2**: Full-text search (Postgres FTS when available)
3. **Stage 3**: Evidence-based skill matching against candidate profile
4. **Stage 4**: Optional AI reranking (mock provider in `AI_MODE=mock`)

## Modules (`server/radar/`)

| Module | Role |
| --- | --- |
| `types` | Canonical job, sighting, freshness, classification |
| `freshness` | Presets, basis, precision-aware labels, composite statements |
| `repost` | Layered similarity + classification |
| `catalog` | Shared catalog + search (no auto-seed) |
| `profile` | `loadCandidateProfileForMatch` — truthful profile loading |
| `match-labels` | Score → label mapping with evidence reasons |
| `nl-search` | Natural language query parsing with prompt injection defense |
| `opportunity-brief` | Lazy-generated personalized job briefs |
| `search-index` | Keyword index (Postgres FTS/OpenSearch later) |
| `persistence/*` | Memory and Postgres store implementations |
| `providers/*` | Greenhouse, Lever, Ashby, USAJobs; LinkedIn/Indeed disabled |
| `service` | Authz-aware application service |
| `queues` | Radar worker queue names |

## Freshness semantics

Fields: `originalPostedAt`, `sourcePostedAt`, `repostedAt`, `firstDiscoveredAt`, `lastVerifiedAt`, plus precision enum.

Bases: originally posted | source posted | reposted | discovered | last verified.

Never show minute-level precision for `DATE_ONLY` sources.

## Repost classifications

`NEW`, `REPOSTED`, `REFRESHED`, `REOPENED`, `DUPLICATE`, `POSSIBLE_DUPLICATE`, `UNCHANGED`, `EXPIRED`, `UNKNOWN`

Exact signals (requisition ID, listing ID, URL, description hash) outrank weak title-only matches.

## Compliance

- LinkedIn / Indeed adapters exist but stay **disabled** without partner credentials.
- Demo LinkedIn fixtures are labeled `demoData: true` — not live connections.
- No logged-in scraping, CAPTCHA bypass, or rate-limit evasion.
- Each provider carries `JobSourcePolicy` (terms, license, RPM, attribution, retention).

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/v1/jobs/search` | GET | Search jobs with filters |
| `/api/v1/jobs/[jobId]` | GET | Get job details |
| `/api/v1/jobs/[jobId]/brief` | GET | Get opportunity brief |
| `/api/v1/jobs/[jobId]/tailor-resume` | POST | Start resume tailoring (CSRF protected) |
| `/api/v1/jobs/[jobId]/interactions` | POST | Record job interaction |
| `/api/v1/jobs/parse-search` | POST | Parse natural language search |

## UI routes

`/app/radar` — single searchable job feed (Best matches / Newest / Reposted / Saved) with advanced filters drawer and split-pane details
`/app/radar/search` — redirects into `/app/radar` preserving query params
`/app/radar/saved`, `/app/radar/alerts`, `/app/radar/jobs/[jobId]`, `/app/radar/sources`


## Resume Tailoring

"Tailor resume" → snapshot job description → call CustomerGenerateService → return `{ workflowId }` for navigation to `/app/resumes/{workflowId}`

**Important**: Does NOT auto-submit applications. User must explicitly apply after reviewing tailored resume.

## Environment

```bash
# App mode (demo | production)
APP_MODE=demo

# AI mode (mock | live)
AI_MODE=mock

# Data mode (memory | postgres)
CANDIDARC_DATA_MODE=memory

# Optional live connectors
USAJOBS_API_KEY=
GREENHOUSE_LIVE=1

# Remain disabled until licensed
LINKEDIN_PARTNER_CREDENTIALS=
INDEED_PARTNER_CREDENTIALS=
```

## Warning

LinkedIn and Indeed **production** access requires approved or licensed integration. Unauthorized scraping is out of scope and not implemented.
