# Candidate experience implementation checklist

Starting SHA (local HEAD before this assignment): `315e9ef084be5624a1a79afcfd686975b8bf5d0c`  
Branch: `feature/radar-v2`  
PR: [#6](https://github.com/deepakreddy21-art/candidarc/pull/6) (open, base `master`)  
Origin head at assignment start: `f724c030a3bfd027091c6d913ce780e7bc1d334f`  
Worktree: `C:\Users\deepa\Desktop\CandidArc` (do not use `CandidArc-merge-wt`)

Statuses: **working** · **incomplete** · **hidden** · **missing** · **unverified** · **blocked**

## Phase A — runtime

| Item | Status | Notes |
| --- | --- | --- |
| `npm run dev` full stack | working | FastAPI `:8090` + Next `:3000`; `AI_MODE=mock` when no paid keys |
| Occupied-port / missing-venv errors | working | |
| Wait Python `/health/ready` | working | `scripts/dev-stack.mjs` waits ready |
| Skip extra worker in in-process mode | working | `QUEUE_BACKEND=inprocess` — Next owns queue |
| PDF/DOCX import pipeline | working | upload → scan → FastAPI parse (unit + live Profile import) |
| Typed error codes to UI | working | `ApiError` surfaces `error.code` |
| Preserve draft on failed replacement | working | last valid profile kept |
| OCR | missing | `IMAGE_ONLY_PDF_OCR_REQUIRED` — not in scope to invent OCR |
| User’s original failing file | unverified | no authorized personal PDF in workspace |

## Phase B — onboarding + import

| Item | Status | Notes |
| --- | --- | --- |
| 3 visible steps | working | `onboardingFlowVersion: 3` |
| Light layout | working | scrollable form; footer not covering fields |
| Prefill employment after import | working | |
| Persist projects/publications | working | v2 PATCH includes keys |
| Manual profile without employment | working | career sections open in manual mode |
| Google OAuth | blocked | no client credentials configured |

## Phase C — nav / Profile / Resumes

| Item | Status | Notes |
| --- | --- | --- |
| Jobs / Applications / Resumes | working | primary nav |
| Profile as primary dest | working | `/app/profile` |
| Settings in account menu | working | not a primary dest |
| Resume library search / base | working | customer `workflowId` only — demo `resume-cisco` artifacts stay on Applications |
| Tailor pasted JD | working | `/app/resumes/new` |

## Phase D — Jobs/Radar

| Item | Status | Notes |
| --- | --- | --- |
| Best/New/Saved, filters, tailor | working | live Jobs feed |
| Sponsorship filter + labels | working | stated / historical / not_offered / unknown |
| Saved search / alerts from Jobs | working | dialogs; UI `best_match` sort coerced for POST |
| Live Greenhouse/USAJOBS | unverified | demo fixtures; live ingest flag/credential gated |
| LinkedIn/Indeed | hidden | disabled pending license |

## Phase E — editor / export

| Item | Status | Notes |
| --- | --- | --- |
| 3 progress phases + Python gen | working | customer labels only (no HR_AUDIT/V0) |
| PDF/DOCX when Final QA ready | working | live DoorDash workflow PDF 32457 bytes, DOCX 9026 bytes |
| Selected-text improve / restore | working | refine accepts `selectedText`; Change template hidden; restore does not overwrite immutable files |
| Version compare | working | version history + compare |

## Phase F — Applications

| Item | Status | Notes |
| --- | --- | --- |
| Status tracker | working | counts + status select |
| Notes / contacts / dates / reminders | working | metadata jsonb; live persist after reload |
| Cover letter on application | working | grounded from career evidence; live USAA/DoorDash draft |

## Phase G — alerts / notifications / metrics

| Item | Status | Notes |
| --- | --- | --- |
| Alert evaluation | working | in-catalog; first-run in-app deliveries |
| Notification center | working | `/app/notifications`; Cisco repost includes original age |
| Email delivery | blocked | Email/Push checkboxes unconfigured; product does not claim send |
| Activity counts on existing screens | working | Saved / Applied / Interviewing / Offers / Follow-ups due |

## Phase H — copilot / cover letters / interview

| Item | Status | Notes |
| --- | --- | --- |
| Contextual ask panel | working | job / resume / application |
| Cover letters | working | evidence-templated BFF; no invented referrals |
| Interview prep workspace | working | `/prepare` STAR + generated-not-sourced; layout no longer says “moved” |

## Phase I — autofill / referrals

| Item | Status | Notes |
| --- | --- | --- |
| Extension save-job | working | supervised overlay; never auto-submit |
| GH/Lever/Ashby autofill | working | adapters + mapping API; live ATS fill unconfigured without pairing |
| Manual contacts / outreach drafts | working | live persist; “does not send” |

## Phase J — visual / a11y / journeys

Live-tested: sign-in, Jobs, tailor, resume ready, PDF/DOCX, Applications workspace, Profile, Resumes library, Create alert, Notifications, interview prep, onboarding scroll. Onboarding sticky footer and closed skills `<details>` fixed. Resume library no longer 404s on demo `resume-cisco`.

## Phase K — safe cleanup

No unsafe deletions. Leftover internal workspace routes (`research`, `evidence`, `audits`, `activity`, `application`, `resume`) remain as “moved” banners to overview. Interview Lab is not restored. Demo pipeline apps stay in Applications without fake customer workflow links. LinkedIn/Indeed stay disabled.

## Blocked for manual UAT

- Live Google OAuth (no credentials)
- Live Greenhouse/USAJOBS ingest (flags/credentials)
- Paid model generation (`AI_MODE=mock` locally)
- Email/push providers
- Live ATS extension pairing / never-submit fill on a real board
- Personal résumé files (none authorized in workspace)
