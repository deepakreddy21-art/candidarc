# Cost model — estimates, not a promised bill

Prices checked September 20, 2026:
- [OpenAI GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini): $0.15 / million input tokens; $0.60 / million output tokens. Cached input $0.075; the model below assumes no cached discount.
- [Brave Search API](https://brave.com/search/api/): $5 / 1,000 search requests, $5 monthly credit. The generative Answers product is not used.
- [Cloudflare R2 Standard](https://developers.cloudflare.com/r2/pricing/): $0.015 / GB-month, Class A $4.50 / million, Class B $0.36 / million; included 10 GB-month, 1 million Class A and 10 million Class B; Internet egress is free. R2 rounds billed usage up. Account-wide allowances may already be consumed elsewhere.

The previous nominal workflow could invoke paid research/plan helpers, initial generation, four audits, four rewrites and final QA (plus retries). Some legacy repairs/providers were deterministic, so the nominal stage count is not a measured paid-request count. The new tailoring path allows one external generation dispatch and zero paid follow-up audits/rewrites/reviews. Public search remains a separate cost.

Reproduce: `npm run report:resume-cost`. Assumptions: 90% completed operations, 10,000 input + 3,000 output tokens for every attempt including failed attempts; 25% research cache hits; three searches on each cold attempt. Retained object growth is 0.5 MB per completion plus 0.1 MB per failure (including assumed amortized originals); database growth 120 KB per attempted operation. These byte/token figures are illustrative, not corpus measurements. Actual source lengths, failed responses, original sizes, backups, indexes, WAL and history may differ.

| Monthly completed résumés | 1,000 | 10,000 |
| --- | ---: | ---: |
| Attempted operations (including failures) | 1,112 | 11,112 |
| Generation list-price estimate | $3.67 | $36.67 |
| Search requests | 2,502 | 25,002 |
| Search gross estimate | $12.51 | $125.01 |
| Search after an otherwise-unused $5 credit | $7.51 | $120.01 |
| Object growth per month | 0.51 GB | 5.11 GB |
| Database growth per month, before indexes/backups/WAL | 0.13 GB | 1.33 GB |
| R2 storage month 1 upper estimate with unused allowance | $0 | $0 |
| R2 storage month 12 upper estimate, retained monthly cohorts | $0 | $0.78 |
| Month 1 variable subtotal with unused allowances | **$11.18** | **$156.68** |

R2 estimates use month-end retained bytes as an upper bound, not measured daily-average GB-month. Assumed 10 Class A and 30 Class B operations per attempt fit within unused allowances here. Without credits/free allowances, add gross storage/operation charges; do not assume account-specific eligibility. With no research cache hits, search alone would be about $16.68 / $166.68 gross for these attempted-operation counts.

Fixed shared costs are deliberately separate and **unknown**: Next.js, FastAPI, workers, Redis, PostgreSQL, backups, monitoring and any local-model compute. `FIXED_SHARED_MONTHLY_USD` can label an operator-supplied monthly figure in the scenario output; it is not inferred from source code. No deployed object provider/account allowance or compute invoice was available to inspect, so R2 is configuration preparation, not a recommended production migration based on actual bills.

Measured in automated tests: dispatch counts with stubs, saved-response/format reuse, output byte integrity and template parity. Runtime records now include token counts, search reservations, local check latency/CPU/process peak RSS, render latency and stored bytes. No real-provider latency, semantic quality, success rate, production database plan or infrastructure saving was measured. The next production measurement is cost per *completed* résumé including failed/uncertain operations, plus separately reported retained storage growth and shared compute. Reducing duplicate requests is a concrete saving; fewer rows alone usually postpone a tier upgrade.
