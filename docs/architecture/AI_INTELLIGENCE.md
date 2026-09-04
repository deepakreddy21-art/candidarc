# AI intelligence layer

CandidArc keeps AI orchestration inside the server-side modular monolith. Browser code sends application and audit actions to `/api/v1`; API keys, provider clients, prompts, evidence validation, and usage accounting remain under `server/`.

## Runtime configuration

Demo environments default to `AI_MODE=mock`. Production defaults to and requires `AI_MODE=live`.

```dotenv
AI_MODE=live
AI_GENERATION_PROVIDER=openai
AI_HR_AUDIT_PROVIDER=anthropic
AI_EM_AUDIT_PROVIDER=anthropic
AI_FINAL_REVIEW_PROVIDER=openai
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_GENERATION_MODEL=gpt-4o-mini
ANTHROPIC_AUDIT_MODEL=claude-sonnet-4-20250514
OPENAI_FINAL_MODEL=gpt-4o-mini
```

`AI_PROVIDER=mock|openai` remains a compatibility input. Legacy `openai` selects live mode and OpenAI for every role; legacy `mock` selects mock mode.

`assertSafeRuntime` rejects mock providers in live mode, rejects mock mode in production, and requires keys for every selected role. There is no live-to-mock fallback.

## Provider routing

`getProviderForRole()` routes generation/evidence/research, HR audits, engineering audits, and final review independently. OpenAI uses native structured-output parsing. Anthropic is instructed to emit JSON, parses it with the same Zod schemas, and retries once for malformed output or transient provider failures. Providers log only prompt ID, model, latency, and token counts.

## Grounding and provenance

Research starts from application metadata and the permitted public-source collector. The collector accepts the supplied job URL plus Greenhouse, Lever, or Ashby URLs already present in the supplied posting. It applies URL, timeout, redirect, and response-size limits. A failed fetch remains a source with a failure note; the collector never fabricates a replacement URL.

Resume bullets carry evidence IDs, matched requirements, technologies, confidence, claim risk, and source version. Shared guards reject unknown evidence IDs and technologies absent from candidate evidence. Only accepted or edited audit findings reach the next generation; rejected and open findings are excluded. Accepted major/critical audit decisions become active mistake-memory rules.

Every provider call records provider, model, prompt version, latency, token counts, and estimated cost in the usage ledger. Resume versions are append-only snapshots.

## Final QA

Blocking deterministic checks run first and cannot be overridden by a model. The role-routed final AI review is stored only as a supplement after deterministic checks pass.

## Limitations

- Public collection is intentionally narrow and does not scrape LinkedIn or Indeed.
- HTML extraction is text-only and does not execute JavaScript.
- Provider cost values are estimates, not billing records.
- PDF visual QA is not claimed unless a separate renderer check is added.

## Optional live smoke

No paid calls run in tests. To make one tiny structured generation call:

```powershell
$env:AI_MODE="live"
$env:RUN_LIVE_AI_SMOKE="1"
npx tsx scripts/ai-live-smoke.ts
```

Configure keys for all selected live providers first.
