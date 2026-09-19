# Approved paper-and-ribbon implementation

Reference: the three CandidArc concept images approved on 2026-09-18/19: homepage, onboarding review, and résumé-creation storyboard. This implements their visual system in the existing application; it does not replace authentication, extraction, reviewed evidence, or workflow services.

## Reference-to-application map

| Approved element | Implementation |
| --- | --- |
| Light white/mint canvas, forest-green actions, lime highlights | `src/app/approved-visuals.css`; scoped styles, no dark theme |
| Arc wordmark | `src/components/brand/logo.tsx`; reusable code-native arc |
| `YOUR NEXT MOVE STARTS HERE.` | Homepage eyebrow, exact copy |
| `Get noticed for` / `what you can do.` | Bold sans-serif homepage heading, green second line |
| `Find the right roles. Understand the team.` / `Bring your strongest experience forward.` | Homepage supporting copy |
| `Build my resume`, `See it in action`, `Get started`, `How it works`, `Sign in` | Real signup/signin links, section link, interactive demo dialog |
| `Have a résumé? Bring it. Starting fresh? Start here.` | Homepage support text |
| Tilted paper, satin ribbon, mint halo, folded corner | `public/brand/hero-resume.webp`; derived from approved artwork |
| `Your experience, in focus.` / `Sample preview` | Accessible HTML overlays |
| `The team uses Python. So have you.` / `Research connects the dots in your experience.` | Separate floating forest panel; explicit white HTML text |
| `Your experience.` / `Already organized.` | Onboarding's career-profile left panel, bold sans-serif |
| `Bring your résumé. We’ll help you make it yours.` | Onboarding panel supporting copy |
| Four paper cards: Contact, Experience, Education, Projects | `public/brand/onboarding-organized.webp` |
| `More opportunities ahead.` / `PEOPLE PROGRESS FURTHER` | Left-panel decorative signature |
| `Step 2 of 3`, three segments, `Log out` | Actual onboarding step and logout handler |
| `Review your experience` / `We’ve organized your résumé. Check the details below.` | Shown after successful import; upload/manual entry remains available before import |
| Imported counts and filename chip, `Replace file` | Real form counts and selected filename; honest `Uploaded résumé` fallback when restored API state has no filename |
| Contact / Experience / Education / Projects accordions | Real candidate fields; record summaries with expandable editors |
| Additional profile sections | Certifications, publications, professional summary and skills remain accessible below the primary sections |
| `Back`, `Continue`, `All changes saved` | Existing save queue and versioned navigation; success only after real save acknowledgement |
| `Watch your experience come into focus.` | Live résumé-generation headline and demo heading |
| `Three quiet moments. One résumé built around you.` | Live résumé-generation and demo supporting copy |
| `Understanding the role` / `The right details come together.` | Backend `understanding` phase, two paper cards |
| `Tailoring your résumé` / `Your strongest experience moves forward.` | Backend `tailoring` phase, Experience / Projects / Skills strips |
| `Ready for your review` / `Review. Download. Make your next move.` | Completed workflow; real résumé preview and downloads |
| `Download PDF` / `Download DOCX` | Existing authenticated download endpoints |
| Studio desk, satin ribbon, books, plants and pen | `public/brand/resume-studio.webp`; HTML papers rendered above it |

The approved pictures used fictional Jordan Lee content. Marketing keeps that content explicitly illustrative. Onboarding and the actual résumé preview use the account's real imported/reviewed/generated content. The live in-progress illustration uses generic section labels rather than a fabricated candidate résumé.

The storyboard's explanatory production notes are not presented as product UI. Its three keyframes are available in the interactive marketing demo. The backend's additional quality-check state remains explicit as `Checking your résumé`; it never masquerades as completed output.

## Motion and access

- Single entrance for hero and onboarding illustrations, then stationary during editing.
- Paper/strip entrance on actual processing-state changes; no timer advances the real workflow.
- The quality-check visual runs twice and settles; no endless decorative motion.
- Marketing playback is user initiated, stops on the final moment, has Pause and manual scene controls.
- `prefers-reduced-motion` removes animation and automatic playback, retaining scene selection and all information.
- Keyboard-operable native accordions, actual input labels, visible focus states, status announcements, and required-field error messages.
- Header/hero, review, generation and demo adapt at 390px; the mobile onboarding footer remains reachable.
- Generation can still show missing-details inputs, failures/retry and real elapsed time.

## Artwork provenance and size

Assets were derived with the built-in image-generation tool from the user's approved concepts, then encoded as WebP for this repository. No new runtime dependencies or paid import API calls were added.

- `hero-resume.webp`: 68,268 bytes.
- `onboarding-organized.webp`: 53,948 bytes.
- `resume-studio.webp`: 65,872 bytes.
- Total source artwork: 188,088 bytes. Next Image supplies responsive image sizes.

Asset prompts: preserve the approved composition/materials and extract only the art; remove webpage controls. For the hero, remove badge/banner/annotation so they can be real HTML. For the studio, remove all central papers/text/buttons so state-specific HTML papers can occupy that space. For onboarding, retain the four ordered cards and paper roll on pale mint.

## Verification scope

`approved-visuals.spec.ts` captures actual built pages at desktop and 390px, exercises the demo's scene buttons and reduced motion, uploads a real fixture through the Python import path, edits a real employer, reloads to prove persistence, and checks required phone validation. Generation presentation states use explicit HTTP fixtures; the ready preview is additionally reached through actual application generation in mock-AI mode. Existing import, onboarding and résumé interaction suites remain separate.

`approved-visuals.test.tsx` verifies real counts/record editing, server-driven progress, missing-details access, no sample candidate leakage into live scenes, and truthful save status.

Screenshots and traces are Playwright artifacts. This UI change is not a claim of new live-provider, OCR, PostgreSQL or extraction-algorithm validation.


The verification also caught and corrected two presentation bugs: the save status now becomes `Unsaved changes` as soon as a field changes, and an older save acknowledgement cannot mark a newer form snapshot saved. Accordion expansion is stored independently of field contents, so completing a missing phone/name/title cannot close the editor while typing.


Validation for this implementation pass: production build and TypeScript check passed; changed-file ESLint and `git diff --check` passed; full unit run 457 passed / 6 existing skips; 23 focused component/save-queue checks passed after the accordion/save-status correction; built application browser pass 30/30 passed with retries disabled. The new visual journey is included in the built CI suite as well as the normal browser suite. PostgreSQL/live providers were not newly exercised by this UI pass.
