# CandidArc Playwright interaction audit

Counts are **unique (route, control name, representative state)** tuples inventoried from routes, components, and the running app. Repeated row/list controls (job cards, application rows, notification items, version history rows) are counted once and exercised with representative records. Desktop vs mobile: a control is in-scope for a viewport if it is visible or reachable there; mobile-only menus are not counted as desktop coverage.

| Result | Meaning |
| --- | --- |
| passed | Independent Playwright test asserted the observable outcome |
| failed | Test failed; defect remains |
| visibility-only | Control presence asserted without activating it |
| legitimately disabled / unavailable | Control is visible but disabled with a stated reason, or capability not implemented |
| externally blocked | Requires Google credentials, employer site, billing provider, or live AI |

## Inventory

| Route / state | Control | Expected outcome | Spec | Desktop / mobile | Result |
| --- | --- | --- | --- | --- | --- |
| `/` anonymous | Get started | Navigates to `/sign-up` | `landing.interactions.spec.ts` | both | passed |
| `/` anonymous | Sign in | Navigates to `/sign-in` | `landing.interactions.spec.ts` | desktop | passed |
| `/` anonymous | Marketing anchors | Scrolls to matching section | `landing.interactions.spec.ts` | desktop | passed |
| `/` ~390px | Open menu → Sign in | Opens drawer then `/sign-in` | `mobile.interactions.spec.ts` | mobile | passed |
| `/sign-up` | Create account | Creates session and opens onboarding | `auth.interactions.spec.ts` | desktop | passed |
| `/sign-up` | Validation | Stays on form with message | `auth.interactions.spec.ts` | desktop | passed |
| `/sign-in` | Sign in / keyboard submit | Reaches Jobs | `auth.interactions.spec.ts` | desktop | passed |
| `/sign-in` | Invalid credentials | Error, input preserved | `auth.interactions.spec.ts` | desktop | passed |
| `/sign-in` `/sign-up` | Show/Hide password | Toggles input type, keeps value | `auth.interactions.spec.ts` | desktop | passed |
| `/sign-in` | Continue with Google | Local start or not-configured banner | `auth.interactions.spec.ts`, `google-auth.spec.ts` | desktop | externally blocked (Google account) |
| App shell | Log out | Returns to `/sign-in`, `/app` blocked | `auth.interactions.spec.ts` | desktop | passed |
| `/onboarding` step 1 | Back | Disabled on first step | `onboarding.interactions.spec.ts` | desktop | passed |
| `/onboarding` | Continue (invalid) | Stays on step 1 | `onboarding.interactions.spec.ts` | desktop | passed |
| `/onboarding` | Continue / Back | Advances and restores chips | `onboarding.interactions.spec.ts` | desktop | passed |
| `/onboarding` career | Enter manually / Add role | Employment fields without duplicate job form | `onboarding.interactions.spec.ts` | desktop | passed |
| `/onboarding` | Log out | `/sign-in` | `onboarding.interactions.spec.ts` | desktop | passed |
| `/onboarding` upload | PDF import reviews fixture fields | No fabricated second job / missing pubs | `import.interactions.spec.ts` | desktop | passed |
| `/app/profile` upload | DOCX import confirm + reload | Employment/portfolio persist | `import.interactions.spec.ts` | desktop | passed |
| `/app/profile` upload | Image-only PDF | OCR-unsupported failure message | `import.interactions.spec.ts` | desktop | passed |
| App shell | Primary nav Jobs/Applications/Resumes/Profile | Authorized page for each | `navigation.interactions.spec.ts` | desktop | passed |
| App shell | Nav pending feedback | Visible within ~1s on click | `recovery.interactions.spec.ts`, `navigation.performance.spec.ts` | desktop | passed |
| App shell | Account menu Profile/Settings | Navigates | `navigation.interactions.spec.ts` | desktop | passed |
| App shell | Command palette | Opens, navigates, Escape closes | `navigation` + `keyboard` | desktop | passed |
| App shell | Notifications bell | `/app/notifications` | `navigation.interactions.spec.ts` | desktop | passed |
| `/app/settings` | Settings cards (whole card) | Navigate without nested misleading targets | `navigation.interactions.spec.ts` | desktop | passed |
| Nested settings | Breadcrumbs | Return to Settings | `navigation.interactions.spec.ts` | desktop | passed |
| `/app/evidence` | Legacy Evidence URL | Redirects to Profile | `navigation.interactions.spec.ts` | desktop | passed |
| `/app/insights` | Insights (not primary nav) | Reachable heading | `navigation.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Filters open/Escape | Drawer shows labeled fields and closes | `jobs.interactions.spec.ts` | both | passed |
| `/app/radar` | Apply Remote | URL + result set match Remote | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Reset filters | Clears URL and restores results | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Search | Visible rows match keyword | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Save / Unsave | Saved tab + reload / removal | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Hide + Undo hide | Job disappears then returns | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Job select | Detail panel content | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Apply on company site | Opens controlled `example.com` tab; tracker unchanged | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Tailor my resume | Immediate Starting; single in-flight POST | `recovery.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Save search / Create alert | Persist on Saved / Alerts | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar` | Load more | Paginate without duplicates; keep Remote filter | `jobs.interactions.spec.ts` | desktop | passed |
| `/app/radar/alerts` | Pause / Resume / Delete | No duplicates; gone after reload | `alerts.interactions.spec.ts` | desktop | passed |
| `/app/radar/saved` | Rename search | Persists after reload | `alerts.interactions.spec.ts` | desktop | passed |
| `/app/opportunities` | Search / status / archive / restore | Observable list + reload | `applications.interactions.spec.ts` | desktop | passed |
| `/app/opportunities` | Failed list GET | Error + Retry (no endless spinner) | `recovery.interactions.spec.ts` | desktop | passed |
| Application workspace | Notes save / Cancel | Persist vs unchanged after reload | `applications.interactions.spec.ts` | desktop | passed |
| Application workspace | Draft cover letter | Editor fills, no private-note leakage | `applications.interactions.spec.ts` | desktop | passed |
| Interview prep | Save practice response | Persists after reload | `applications.interactions.spec.ts` | desktop | passed |
| `/app/resumes` | Empty / search / open | Browse jobs; opens matching resume | `resumes.interactions.spec.ts` | desktop | passed |
| `/app/resumes` | Failed list GET | Error + Retry | `recovery.interactions.spec.ts` | desktop | passed |
| `/app/resumes/new` | Validation / generate / fail | Error keeps JD; success downloads | `resumes.interactions.spec.ts` | desktop | passed |
| `/app/resumes/new` | Double-click generate | Single workflow | `recovery.interactions.spec.ts` | desktop | passed |
| Resume ready | PDF / Word downloads | Parsed bytes contain candidate + employer content | `resumes.interactions.spec.ts` | desktop | passed |
| Resume ready | Retry PDF | Word still downloadable; no new generate | `resumes.interactions.spec.ts` | desktop | passed |
| Resume ready | Refine / version | New version; history intact | `resumes.interactions.spec.ts` | desktop | passed |
| Assistant | Open/close, send+reload, fail+retry | Panel, persistence, recovery | `assistant.interactions.spec.ts` | desktop | passed |
| Preferences | Save preferences | Digest persists (device-local appearance OK) | `settings.interactions.spec.ts` | desktop | passed |
| Billing | Manage billing / invoice | Disabled + reason | `settings.interactions.spec.ts` | desktop | legitimately disabled |
| Privacy | Model-improvement opt-in | Account/tenant PATCH; not shared localStorage | `settings.interactions.spec.ts` | desktop | passed (enforced) |
| Privacy | Retention / evidence visibility | Visibly unavailable with explanation | `settings.interactions.spec.ts` | desktop | unavailable (honest) |
| Privacy | Export JSON | Filename + payload fields | `settings.interactions.spec.ts` | desktop | passed |
| Privacy | Delete documents | Disabled + reason | `settings.interactions.spec.ts` | desktop | legitimately disabled |
| Privacy | Account delete cancel / confirm | Stay signed in / disposable sign-out | `settings.interactions.spec.ts` | desktop | passed |
| Integrations | Connector list | No fake Connect buttons | `settings.interactions.spec.ts` | desktop | passed |
| `/app/profile` | Save identity / Cancel / links | Persist or revert; import-status failure isolated | `profile` + `recovery` | desktop | passed |
| Mobile shell | Open navigation / bottom nav | Destinations | `mobile.interactions.spec.ts` | mobile | passed |
| Mobile Jobs | Filters apply + Save | Results + persistence | `mobile.interactions.spec.ts` | mobile | passed |
| Mobile | Upload → tailor → PDF download | Focused core flow | `mobile.interactions.spec.ts` | mobile | passed |
| Health | `/` and `/api/v1/health` | Ready | `startup.interactions.spec.ts` | desktop | passed |

## Privacy controls (truthful)

| Control | Backend | Browser behavior |
| --- | --- | --- |
| Model improvement opt-in | Persisted on authenticated account (`PATCH` profile / privacy field) | Cleared across logout; not shared via localStorage across accounts |
| Retention period | Not implemented as a server job | Control disabled with explanation |
| Evidence visibility sharing | Not implemented | Control disabled with explanation |
| Appearance / theme | Device-local | Documented as device preference |

## Local verification notes

Environment for routine Playwright: `CANDIDARC_DATA_MODE=memory`, `QUEUE_BACKEND=inprocess`, `AI_MODE=mock`, `APP_MODE=demo`, `NEXT_PUBLIC_APP_MODE=demo`, Python résumé intelligence on `:8090`, Next on `:3000`.

Built-app pass uses `npm run build` then `npx next start` via `playwright.built.config.ts` (`npm run test:e2e:built`). Durability/isolation claims that require PostgreSQL remain covered by existing integration tests, not by the memory e2e suite.

Artifacts (gitignored): `playwright-report/`, `playwright-report-built/`, `test-results/`.

## Explicit exclusions / externally blocked

- Live Google OAuth completion (no CI credentials) — local start/error banner covered
- Live employer form submit / real job applications (controlled `example.com` handoff covered)
- Stripe/billing portal and invoices
- Email/push alert delivery (provider unconfigured)
- Production AI providers (`AI_MODE=mock`)
- Server-side retention purge jobs and evidence-sharing policies (deliberately unavailable in UI)
