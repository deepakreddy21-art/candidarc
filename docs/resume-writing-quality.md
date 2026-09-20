# Résumé writing review

The `writing-r1` policy applies the candidate's ten writing criteria: repetition,
action verbs, outcomes/scope, direct language, length/relevance, analytical skills,
communication, leadership, teamwork, and initiative. This is CandidArc guidance
informed by the supplied criteria, not integration with or certification by VMock.

## Generation and editing

`app/prompts/resume-writing-policy.json` is shared by Python and TypeScript
generation, HR/EM audit, and final-review prompts. Prefer precise, varied verbs
such as diagnosed, reconciled, implemented, streamlined, or documented when they
describe the candidate's actions. Built and developed remain available when a
stronger alternative would distort the meaning. Do not exhaust a synonym list,
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

## Validation for this change

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
