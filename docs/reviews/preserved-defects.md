# Preserved review defects

Baseline: d81f5c339c1dde31d0d144f82ddc5372db9f2c59 (PR #13).
This inventory preserves findings from the independent review. A green CI result does not establish production readiness. Unrelated issues are not silently discarded by the single-request redesign.

| ID | Defect | Scope in this change |
| --- | --- | --- |
| D1 | Employment headers join location/date tokens into invented company claims (`TX Jan`). | Fix field-wise claim checking. |
| D2 | Missing JD employer/title can become placeholder research queries. | Keep local extraction and require resolved identity before public research. |
| D3 | Structured education/project/publication details lost at Python boundary. | Preserve structured evidence details and source text. |
| D4 | Contact corrections reuse old workflow identity. | Include immutable contact and evidence snapshot hashes. |
| D5 | Whitespace research quotes accepted as grounding. | Harden shared quote authorization; no paid synthesis in new path. |
| D6 | Format retry selects oldest approved résumé and mixes export versions. | Version-specific retry and artifact identity. |
| D7 | Concurrent refinements create competing workflows. | New path uses supported local edits only; no paid refinement workflow. |
| D8 | Audit evidence IDs dropped by TS adapter. | Preserve IDs for historical compatibility; new path performs no HR/EM audits. |
| D9 | Quick actions advertise unsupported rewrites. | Expose actual capabilities and preserve valid document on unsupported edits. |
| D10 | Selected-text edits affect identical text in multiple roles. | New path disables unsupported selected-text rewrites. Stable section/item/bullet identity remains required before a future local rewrite model is enabled; legacy logic is not represented as fixed. |
| D11 | Final-QA retry repeats unchanged failed document. | New path resumes saved response; local failure is actionable, never another paid call. |

Historical free-form refinement semantics and legacy audit orchestration remain archived for old documents. Do not reactivate their paid handlers for in-flight customer jobs. Production corpus evaluation, live provider latency, semantic correctness beyond deterministic checks, actual database sizes/query plans, and deployment resource measurements remain verification work; this repository alone cannot establish those results.
