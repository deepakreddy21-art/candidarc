# CandidArc Radar

## Product promise

Find genuinely fresh opportunities, understand when a listing was actually created, and know whether a “new” job is only a repost.

CandidArc tracks appearances of a role across company sites and job platforms so candidates can separate fresh openings from recycled listings.

**Honest coverage language:** broad source coverage, company-direct discovery, multi-source job intelligence — not “every job on the internet.”

## Architecture

Shared catalog (not per-user crawls):

```text
Source ingestion → Raw sighting → Normalization → Canonical matching
→ Repost classification → Verification → Search index → User matching → Alerts
```

User-specific data stays tenant-isolated: saved searches, matches, hidden/saved jobs, alerts, application links.

## Modules (`server/radar/`)

| Module | Role |
| --- | --- |
| `types` | Canonical job, sighting, freshness, classification |
| `freshness` | Presets, basis, precision-aware labels |
| `repost` | Layered similarity + classification |
| `catalog` | Shared in-memory catalog + seed + search |
| `search-index` | Keyword index (Postgres FTS/OpenSearch later) |
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

## UI routes

`/app/radar`, `/search`, `/saved`, `/alerts`, `/jobs/[jobId]`, `/sources`

## Application handoff

`Build an application for this role` → snapshot job description + canonical/sighting IDs → existing Phase 2 research workflow.

## Environment

```bash
# Optional live connectors
USAJOBS_API_KEY=
GREENHOUSE_LIVE=1
# Remain disabled until licensed
LINKEDIN_PARTNER_CREDENTIALS=
INDEED_PARTNER_CREDENTIALS=
```

## Warning

LinkedIn and Indeed **production** access requires approved or licensed integration. Unauthorized scraping is out of scope and not implemented.
