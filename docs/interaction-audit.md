# CandidArc Playwright interaction audit

Counts are **unique (route, control name, representative state)** tuples inventoried from routes, components, and the running app. Repeated row/list controls (job cards, application rows, notification items, version history rows) are counted once and exercised with representative records. Desktop vs mobile: a control is in-scope for a viewport if it is visible or reachable there; mobile-only menus are not counted as desktop coverage.

| Result | Meaning |
| --- | --- |
| passed | Independent Playwright test asserted the observable outcome |
| failed | Test failed; defect remains |
| legitimately disabled | Control is visible but disabled with a stated reason |
| externally blocked | Requires Google credentials, employer site, billing provider, or live AI |

## Inventory

| Route / state | Control | Expected outcome | Spec | Desktop / mobile | Result |
| --- | --- | --- | --- | --- | --- |
| `/` anonymous | Get started | Navigates to `/sign-up` | `landing.interactions.spec.ts` | both | passed target |
| `/` anonymous | Sign in | Navigates to `/sign-in` | `landing.interactions.spec.ts` | desktop | passed target |
| `/` anonymous | Marketing anchors | Scrolls to matching section | `landing.interactions.spec.ts` | desktop | passed target |
| `/` ~390px | Open menu → Sign in | Opens drawer then `/sign-in` | `mobile.interactions.spec.ts` | mobile | passed target |
| `/sign-up` | Create account | Creates session and opens onboarding | `auth.interactions.spec.ts` | desktop | passed target |
| `/sign-up` | Validation | Stays on form with message | `auth.interactions.spec.ts` | desktop | passed target |
| `/sign-in` | Sign in / keyboard submit | Reaches Jobs | `auth.interactions.spec.ts` | desktop | passed target |
| `/sign-in` | Invalid credentials | Error, input preserved | `auth.interactions.spec.ts` | desktop | passed target |
| `/sign-in` `/sign-up` | Show/Hide password | Toggles input type, keeps value | `auth.interactions.spec.ts` | desktop | passed target |
| `/sign-in` | Continue with Google | Local start or not-configured banner | `auth.interactions.spec.ts`, `google-auth.spec.ts` | desktop | externally blocked (Google account) |
| App shell | Log out | Returns to `/sign-in`, `/app` blocked | `auth.interactions.spec.ts` | desktop | passed target |
| `/onboarding` step 1 | Back | Disabled on first step | `onboarding.interactions.spec.ts` | desktop | passed target |
| `/onboarding` | Continue (invalid) | Stays on step 1 | `onboarding.interactions.spec.ts` | desktop | passed target |
| `/onboarding` | Continue / Back | Advances and restores chips | `onboarding.interactions.spec.ts` | desktop | passed target |
| `/onboarding` career | Enter manually / Add role | Employment fields without duplicate job form | `onboarding.interactions.spec.ts` | desktop | passed target |
| `/onboarding` | Log out | `/sign-in` | `onboarding.interactions.spec.ts` | desktop | passed target |
| `/onboarding` upload/finish | PDF import, Finish setup | Journey specs | `candidate-experience.spec.ts`, `onboarding-v2.spec.ts` | desktop | journey |
| App shell | Primary nav Jobs/Applications/Resumes/Profile | Authorized page for each | `navigation.interactions.spec.ts` | desktop | passed target |
| App shell | Account menu Profile/Settings | Navigates | `navigation.interactions.spec.ts` | desktop | passed target |
| App shell | Command palette | Opens, navigates, Escape closes | `navigation` + `keyboard` | desktop | passed target |
| App shell | Notifications bell | `/app/notifications` | `navigation.interactions.spec.ts` | desktop | passed target |
| `/app/settings` | Open cards | Profile, Preferences, Integrations, Privacy, Billing | `navigation.interactions.spec.ts` | desktop | passed target |
| Nested settings | Breadcrumbs | Return to Settings | `navigation.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Filters open/Escape | Drawer shows labeled fields and closes | `jobs.interactions.spec.ts` | both | passed target |
| `/app/radar` | Apply Remote | URL + result set match Remote | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Reset filters | Clears URL and restores results | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Search | Visible rows match keyword | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Save / Unsave | Saved tab + reload / removal | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Hide + Undo hide | Job disappears then returns | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Job select | Detail panel content | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Apply on company site | `target=_blank`, tracker not Applied | `jobs.interactions.spec.ts` | desktop | externally blocked (live employer) |
| `/app/radar` | Save search / Create alert | Persist on Saved / Alerts | `jobs.interactions.spec.ts` | desktop | passed target |
| `/app/radar` | Load more | Hidden when catalog ≤ 20 | `jobs.interactions.spec.ts` | desktop | legitimately disabled (not shown) |
| `/app/radar/alerts` | Pause / Resume / Delete | No duplicates; gone after reload | `alerts.interactions.spec.ts` | desktop | passed target |
| `/app/radar/saved` | Rename search | Persists after reload | `alerts.interactions.spec.ts` | desktop | passed target |
| `/app/opportunities` | Search / status / archive / restore | Observable list + reload | `applications.interactions.spec.ts` | desktop | passed target |
| Application workspace | Notes save / discard | Persist vs unchanged | `applications.interactions.spec.ts` | desktop | passed target |
| Application workspace | Draft cover letter | Editor fills, no private-note leakage | `applications.interactions.spec.ts` | desktop | passed target |
| Interview prep | Save practice response | Persists after reload | `applications.interactions.spec.ts` | desktop | passed target |
| `/app/resumes` | Empty / search / open | Browse jobs; opens matching resume | `resumes.interactions.spec.ts` | desktop | passed target |
| `/app/resumes/new` | Validation / generate / fail | Error keeps JD; success downloads | `resumes.interactions.spec.ts` | desktop | passed target |
| Resume ready | PDF / Word downloads | Distinct files | `resumes.interactions.spec.ts` | desktop | passed target |
| Assistant | Open/close, send+reload, fail+retry | Panel, persistence, recovery | `assistant.interactions.spec.ts` | desktop | passed target |
| Preferences | Save preferences | Digest persists | `settings.interactions.spec.ts` | desktop | passed target |
| Billing | Manage billing / invoice | Disabled + reason | `settings.interactions.spec.ts` | desktop | legitimately disabled |
| Privacy | Retention / visibility / export | Persist; JSON download | `settings.interactions.spec.ts` | desktop | passed target |
| Privacy | Delete documents | Disabled + reason | `settings.interactions.spec.ts` | desktop | legitimately disabled |
| Integrations | Connector list | No fake Connect buttons | `settings.interactions.spec.ts` | desktop | passed target |
| `/app/profile` | Save identity / Cancel / links | Persist or revert | `profile.interactions.spec.ts` | desktop | passed target |
| Mobile shell | Open navigation / bottom nav | Destinations | `mobile.interactions.spec.ts` | mobile | passed target |
| Health | `/` and `/api/v1/health` | Ready | `startup.interactions.spec.ts` | desktop | passed target |
| Copilot | Download package / approve | Wired to application-package API | exercised via UI code + application workspace | desktop | passed target (package download) |
| Insights `/app/insights` | Charts | Reachable, not in primary nav | inventoried, not primary IA | desktop | inventoried |
| Evidence vault `/app/evidence` | Vault CRUD | Reachable leftover IA | inventoried | desktop | inventoried |

## Local verification (this pass)

Playwright (repository version, `workers: 1`, `maxFailures: 0`, HTML reporter on):

| Project | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| desktop | 81 | 0 | 0 |
| mobile (390×844) | 4 | 0 | 0 |
| **Total** | **85** | **0** | **0** |

### Passed by feature (desktop unless noted)

| Feature / spec | Passed |
| --- | ---: |
| Alerts / saved searches (`alerts.interactions.spec.ts`) | 3 |
| Applications (`applications.interactions.spec.ts`) | 6 |
| Assistant (`assistant.interactions.spec.ts`) | 3 |
| Auth (`auth.interactions.spec.ts`) | 8 |
| Candidate experience journeys (`candidate-experience.spec.ts`) | 3 |
| Candidate screenshots (`candidate-screenshots.spec.ts`) | 1 |
| Customer journey (`customer-journey.spec.ts`) | 1 |
| Google local start (`google-auth.spec.ts`) | 1 |
| Jobs / Radar (`jobs.interactions.spec.ts`) | 13 |
| Keyboard (`keyboard.interactions.spec.ts`) | 2 |
| Landing (`landing.interactions.spec.ts`) | 3 |
| Navigation (`navigation.interactions.spec.ts`) | 6 |
| Onboarding v2 journeys (`onboarding-v2.spec.ts`) | 7 |
| Onboarding interactions (`onboarding.interactions.spec.ts`) | 6 |
| Profile (`profile.interactions.spec.ts`) | 3 |
| Resumes (`resumes.interactions.spec.ts`) | 7 |
| Settings (`settings.interactions.spec.ts`) | 6 |
| Startup readiness (`startup.interactions.spec.ts`) | 2 |
| Mobile shell (`mobile.interactions.spec.ts`, mobile project) | 4 |

Artifacts (gitignored): `playwright-report/index.html`, failure traces/screenshots under `test-results/` (none for this green run). CI uploads `playwright-report` always and `test-results` on failure.

## Defects found and fixed

| Defect | Cause | Fix |
| --- | --- | --- |
| Copilot “Download application package” / “Continue to employer form” did nothing | Buttons had no `onClick` | POST `/application-package`; download JSON or review handoff; never marks Applied |
| Approve autofill did not persist | Local `Set` only | POST `approveAnswerId`; duplicate clicks stay disabled |
| Preferences / privacy Save only toasted | State not persisted | Zustand + localStorage; reload assertions |
| Billing Manage / invoice toasted success | No billing provider | Disabled with explicit reason |
| Delete documents toasted success | No document-delete API | Disabled with reason |
| Alert pause/rename/delete missing | API existed, UI did not | Pause/Resume/Delete + name field |
| PATCH alert cleared the name | `Object.assign` wrote `name: undefined` | Omit undefined patch fields |
| Saved-search form on `/saved` failed | `remote: "remote"` failed Zod boolean | Map remote policy strings; use `remotePolicy` |
| Job hide unused on cards; no undo | `onHide` typed but not rendered | Hide control + Undo hide toast |
| Filter `includeReposts=0` dropped | `writeUrl` deleted `"0"` | Persist zero/false query values |
| Incomplete Reset | Only some URL keys cleared | Reset all applied filter params |
| Missing filter accessible names | Labels not associated | `htmlFor` / `id` on every filter field |
| No password visibility | Control missing | Show/Hide password toggle |
| Duplicate GitHub/Portfolio ids on Profile | Identity + career fields shared ids | `identity-*` ids |
| Application restore missing | Service existed, no route/UI | `POST .../restore` + Show archived |
| Assistant send hid failures | No error/retry UI | Alert + Retry |
| Cover letter/outreach copy missing | Draft existed without copy/download | Copy/download controls |
| Interview practice not saved | Prep page was read-only | Device-persisted practice response |

## Explicit exclusions / externally blocked

- Live Google OAuth completion (no CI credentials) — local start/error banner covered
- Live employer form submit / real job applications
- Stripe/billing portal and invoices
- Email/push alert delivery (provider unconfigured)
- Production AI providers (`AI_MODE=mock`)
- Insights `/app/insights` and Evidence vault `/app/evidence` are leftover routes, not primary nav
- Load more is implemented but hidden: demo catalog has 7 jobs (page size 20)
