# Python resume-intelligence production rollout

Default: `RESUME_INTELLIGENCE_BACKEND=typescript`. Do **not** enable Python in production until staging and canary gates pass.

## Sequence

1. Deterministic local mock (`AI_MODE=mock`, backend typescript or python locally)
2. CI integration (pytest, eval:resume, python-mode, contract drift)
3. Staging with live OpenAI + Anthropic (`AI_MODE=live`, backend still typescript for customers)
4. Approved internal tenants in `shadow` mode (`SHADOW_SAMPLE_PERCENT` > 0 only for approved tenants)
5. 1% Python canary
6. 10% Python canary
7. 50% Python canary
8. Full Python rollout

## Immediate rollback conditions

- Any cross-tenant data exposure
- Any unsupported hard factual claim reaching a downloadable resume
- Provider error-rate regression
- Job failure-rate regression
- Severe latency regression
- Severe cost regression

Rollback action: set `RESUME_INTELLIGENCE_BACKEND=typescript` and redeploy. Keep the TypeScript pipeline intact.

## Evidence store

- Production: `EVIDENCE_STORE=postgres` with pgvector (fail closed; never silent memory)
- Demo/tests: `EVIDENCE_STORE=memory` allowed
- Migration owner: TypeScript/Drizzle (`0009_evidence_embeddings.sql`)
