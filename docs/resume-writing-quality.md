# Résumé writing review

The `writing-r2` policy applies the candidate's ten writing criteria: repetition,
action verbs, outcomes/scope, direct language, length/relevance, analytical skills,
communication, leadership, teamwork, and initiative. This is CandidArc guidance
informed by the supplied criteria, not integration with or certification by VMock.

## Generation and editing

`app/prompts/resume-writing-policy.json` is shared by Python and TypeScript
generation, HR/EM audit, and final-review prompts. Prefer precise, varied verbs
such as diagnosed, reconciled, implemented, streamlined, or documented when they
describe the candidate's actions. Built and developed are valid first choices;
the local review no longer flags a verb simply for being ordinary. Do not exhaust a synonym list,
inflate responsibility, invent metrics, or remove necessary technology keywords.

Free-form refinement currently uses the existing deterministic provider path,
including in live mode. Its new action-verb quick action makes a deliberately
narrow set of context-specific edits (for example, created documentation →
authored documentation). Unsupported transformations leave the checked résumé
unchanged through the existing no-change flow. This is not an extra model call.
Selected-text refinements preserve other text and begin with the reviewed version,
not a fresh reconstruction from profile evidence. Concision no longer truncates
later sentences or parentheses, which can contain scope or metrics.

Python claim validation and TypeScript audit adjudication check stronger opening
responsibility claims against cited candidate actions. This is an additional
conservative check, not a complete semantic proof. Existing evidence and claim
guardrails continue to apply.

## Meaning and natural phrasing (writing-r2)

The existing live Anthropic HR1/EM1/HR2/EM2 calls now return a structured assessment
of **action, object, ownership, scope and outcome**, plus naturalness, for each
proposed edit. The prompt distinguishes implementation from architecture, goals
from achieved outcomes, and a team result from an individual's contribution.
Design evidence about a dashboard must not authorize architecture of a payment
service. The review is contextual model reasoning, not a claim that regex proves
semantic equivalence.

Server enforcement requires the original text in the intended section, sources
belonging to that text, exact quotations found in those sources, supported
verdicts on all five dimensions, and natural wording. Missing assessments are
invalid provider output. Unsupported, uncertain, or awkward edits are rejected;
their original text remains. Deterministic adjudication cannot re-accept a
contextually rejected finding. Provider `edited_text` cannot bypass assessment.
Applying an accepted edit no longer replaces other bullets simply because they
share an evidence ID.

The existing live OpenAI final-QA call separately reviews every supplied text
target (section/item bullets and factual prose). The server assigns target IDs
from the current document and rejects omitted, duplicate or invented IDs. It
validates quote provenance and derives two checks from the structured verdicts:

- `MEANING_PRESERVATION`: blocking when unsupported, uncertain or inadequately
  sourced. It is **not** eligible for the deterministic word-deletion repair;
  the candidate must review the evidence/text rather than receiving a guessed fix.
- `NATURAL_PHRASING`: advisory, since stylistic preference alone must not prevent
  export. Feedback quotes the text and identifies its section/bullet. Successful
  final-review checks are stored against the specific resume version and shown
  under the existing quality review, separate from local heuristic scores.

No extra provider request or API key was added. The existing calls consume more
input/output tokens for the review; their usage accounting is retained. Mock mode
and deterministic refinement do **not** acquire an LLM's semantic understanding.
They retain bounded local edits and evidence guards; mock results do not show a
live meaning-review badge. Initial live generation receives the same policy and
its resulting drafts are checked through audits/final QA. Uncited factual
`section.content` cannot silently pass semantic QA: use evidence-linked bullets.

This is still fallible model review. Verified quotation presence is not a proof
that a model interpreted the quotation correctly. Live output must be evaluated
against held-out candidate documents; mocked SDK tests establish enforcement,
not live-model accuracy. No guarantee of perfect meaning recognition is made.

### Validation for writing-r2

- Vitest: 486 passed, 6 existing skips. The first broad local run lacked Chromium;
  rerunning with the installed browser passed, including PDF/DOCX checks.
- Python: 372 passed, 5 existing skips (`--ignore=tests/live`).
- 35 new semantic-review regressions cover all five dimensions, missing/forged/
  cross-role quotations, missing/duplicate/stale targets, all four audit lenses,
  parsed/JSON SDK transports, ordinary verbs, supported architecture, scoped edit
  application, invalid provider output and final-QA authority.
- Existing deterministic résumé evaluation: 222/222 passed. This remains a
  deterministic evaluation, not a live semantic-quality benchmark.
- Optimized Next build, TypeScript checks, Ruff, mypy, generated Python contract,
  and changed-file lint passed (existing unrelated lint warnings remain).
- UI regressions cover version-bound feedback and advisory phrasing warnings.

Live SDK interactions were exercised with mocked transports. Paid provider calls
and a new local PostgreSQL run were not performed. No schema migration or
dependency change is required. Deploy/restart both web and Python services so
the new optional QA codes and prompt version are available together.

## Candidate review

The completed résumé exposes ten expandable review criteria. A finding identifies
the section and exact bullet and can pass that text to the existing refinement
editor. Suggestions are advisory; missing competencies never block export.
Review recalculates from the current version, contact snapshot, rubric, and actual
rendered PDF page count. Refinement clears the prior report. Stored candidate
profile details and prior résumé versions remain intact.

The local review adds no paid API request. Patterns identify possible signals,
not demonstrated skill or recruiter judgment. Numbers require recognizable scope,
time, money, or outcome units; technology versions and dates alone do not qualify.
Qualitative outcomes are valid. Repetition checks cover duplicated prose and
opening verbs/phrases, not every repeated word. PDF page count is only marked
measured after export. Word pagination can differ. Optional social links are not
required contact fields.

The legacy provider score breakdown remains separate from this ten-criterion
writing review. No external ATS parsing, VMock score, guaranteed ranking, or
guaranteed interview outcome is claimed. Automated checks and mock-provider
journeys cannot establish real-provider writing quality; that requires reviewing
live output against the candidate's actual evidence.

## Validation for writing-r1 (historical)

- TypeScript/Vitest: 484 passed, 6 existing skips.
- Python unit tests: 314 passed.
- Python service journeys: 25 passed, including generation, imports, and bounded
  final-QA repair through a real local FastAPI service with mock AI.
- Optimized Next build, TypeScript checks, Python Ruff/mypy, and changed-file
  ESLint: passed.
- Built-application résumé browser suite: 11 passed with retries disabled,
  including PDF/DOCX content, new versions, no-change recovery, and the ten-point
  review handing exact selected text to the editor. Local Chromium 131 was used;
  CI uses the repository's Playwright browser version.
- Unit regressions cover cited-role responsibility, no fabricated metrics,
  technology-version false positives, contact optionality, cached-review
  invalidation, scoped edits, preserved prior versions, and non-truncating edits.

No paid live-AI calls or new PostgreSQL durability run were performed for this
writing change. Existing CI gates remain enabled.

### CI evaluation correction

The first CI run found an incompatible older evaluation expectation: its clean
number-spelling example changed `Built 5 microservices` into `Architected five
microservices`. Number equivalence does not establish architecture responsibility.
The clean case now keeps the verb unchanged. Separate cases require rejecting
unsupported architecture and accepting it when the same cited evidence records
design work. The evaluator still fails on every unexpected violation; no
guardrail, CI gate, or assertion was disabled. Run `npm run eval:resume` as well as
unit tests when changing generation or claim validation.
