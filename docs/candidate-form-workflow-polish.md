# Candidate forms and workflow polish

Baseline: `8e0b449a9ca57d7f1eb5e8f3fe0b38ea23e77312` on master.

This pass implements the form and interaction findings from the September 19 UX review. It deliberately preserves the homepage wording, approved green artwork, and the copy replacements the owner excluded. It keeps the existing onboarding step order and does not change resume parsing or AI generation policy.

## Candidate-visible changes

- Keep **Full name** and show contact details once in Profile. Phone and current location remain required for onboarding completion; LinkedIn, GitHub, and portfolio remain optional. Preferred name and professional headline use the same editor and save path.
- Commit unfinished role/location chips on blur, keep commas within locations, and preserve spaces while typing career technologies and publication authors. Choosing a suggestion by mouse or keyboard does not save a partial query as an extra chip.
- Keep core job preferences visible and place optional preferences in a disclosure. Show field-specific onboarding errors and focus the affected control.
- Give imported career records one Edit action, compact summaries, and Undo after removal. Give the review form more desktop space.
- Link Jobs to a real, versioned Job preferences page. Disable document/digest preferences that currently have no backend effect.
- Make job titles real links, preserve modified-click navigation, distinguish source posting dates from discovery dates, reset advanced filters completely, and distinguish an empty Saved tab.
- Read selected resume text from the preview iframe, support clearing it, reset it when the document reloads, and disable unavailable downloads.
- Track applications submitted elsewhere without starting research or resume generation. Keep status conflicts visibly unsaved until reloaded, restore every workspace field on Cancel, and expose follow-up/status filters.
- Surface real HTTP errors, including conflicts, rather than reporting a successful demo fallback. Profile/onboarding and application writes retain edits when saving fails.

## Verification

The regression tests exercise unfinished input, keyboard suggestion selection, comma-containing locations, multiword lists, Undo, iframe selection lifecycle, tracking without workflow generation, owner authorization, and save errors.

Browser journeys use the built Next application, FastAPI resume parsing, memory repositories, an in-process queue, and mock AI. They exercise PDF/DOCX review and persistence, Profile autosave, real preference saves, Jobs controls, application status recovery, resume refinement, and mobile navigation/import. These are not live paid-provider or production-database UAT.

The local build uses the same `APP_MODE=demo`, `NEXT_PUBLIC_APP_MODE=demo`, `AI_MODE=mock`, and `CANDIDARC_DATA_MODE=memory` values as the built-browser CI job. Compiling with production feature flags and then launching in demo mode is not an equivalent test build.

Local browser video capture is unavailable because the runner lacks Playwright's FFmpeg binary. The temporary local configuration disables only video; assertions, screenshots and traces remain enabled. Committed CI video configuration is unchanged.

Existing tests are updated to enter the new explicit career editors before asserting fields. A reload must finish loading the import review before the helper enumerates those editors; immediate locator counts otherwise incorrectly skip them.

Local results for this pass:

- Unit suite: 468 passed, 6 existing skips.
- Typecheck and optimized build passed. Full lint: 0 errors, 7 existing warnings.
- 63 distinct affected browser scenarios verified with retries disabled: 59 passed in the broad run, then the three corrected selector/message assertions and the remaining mobile download scenario passed in a focused four-test run.
- Desktop and 390px onboarding review screenshots were visually inspected. Homepage layout/contrast checks remained green at 390–1920px.

The employer handoff test intercepts only its fictional `example.com` destination. It still verifies the exact new-tab URL, destination content, and absence of an automatically created Applied status. This avoids making a local interaction test depend on external network access.

Import-service failure leaves saved contact details visible but read-only; Retry restores the complete editable profile, avoiding an empty career draft being mistaken for saved data.

## Boundaries

No database migration, homepage redesign, parser replacement, new email-delivery service, or claim of complete UX-audit closure is included. Original resumes, paid providers, real Google sign-in, and a human visual walkthrough still require UAT. Merge remains a separate action.
