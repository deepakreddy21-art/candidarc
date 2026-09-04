# CandidArc UI Architecture

## Overview

CandidArc is a Next.js App Router frontend for an AI career operating system. The working product name is centralized in [`src/config/product.ts`](../src/config/product.ts). Rename the product by editing that file; UI surfaces import `product.name` rather than hardcoding the brand.

## Route structure

### Public

| Route | Purpose |
| --- | --- |
| `/` | Marketing landing with interactive product preview |
| `/sign-in` | Sign in |
| `/sign-up` | Sign up |
| `/onboarding` | Multi-step account setup |

### Authenticated (`/app`)

Wrapped by `AppShell` in `src/app/app/layout.tsx`.

| Route | Purpose |
| --- | --- |
| `/app` | Dashboard |
| `/app/opportunities` | Opportunity list/board |
| `/app/opportunities/new` | New opportunity flow |
| `/app/opportunities/[opportunityId]` | Opportunity overview |
| `/app/opportunities/[opportunityId]/research` | Research workspace |
| `/app/opportunities/[opportunityId]/evidence` | Opportunity evidence |
| `/app/opportunities/[opportunityId]/resume` | Resume Studio |
| `/app/opportunities/[opportunityId]/audits` | Sequential audit loop |
| `/app/opportunities/[opportunityId]/interview` | Interview prep for role |
| `/app/evidence` | Evidence Vault |
| `/app/insights` | Progress insights |
| `/app/settings/*` | Profile, preferences, privacy, billing |

## Component organization

```
src/
  app/                 # Routes and layouts only
  components/
    brand/             # Logo / wordmark
    layout/            # AppShell, PageHeader
    ui/                # Primitives (Button, Dialog, Tabs…)
    applications/      # Application domain
    research/
    evidence/
    resume/
    audits/
    interviews/
    insights/
  config/              # Product identity
  data/                # Seeded demo data
  services/            # API adapter layer
  stores/              # Client UI state (Zustand)
  types/               # Domain TypeScript models
```

Pages should stay thin: load/adapt data and compose domain components.

## Design tokens

Tokens live in `src/app/globals.css` as CSS variables mapped into Tailwind via `@theme inline`.

- Light foundation: warm neutrals (`#F4F4F0` background)
- Dark foundation: graphite (`#0D0F13` background)
- Accent: indigo `#5865F2` / `#7B86FF`
- Intelligence accent: cyan `#20BFC6` / `#3DD8D4`

Typography:

- UI: Geist Sans
- Editorial: Instrument Serif
- Mono: Geist Mono for versions, tech, timestamps

## State management

| Concern | Approach |
| --- | --- |
| Theme | `next-themes` |
| Shell UI (sidebar, command palette) | Zustand (`src/stores/ui.ts`) |
| Onboarding draft | Zustand |
| Domain data | Service layer + local component state |
| Toasts | `sonner` |

No global domain store is required for the demo; replace mock fetches with React Query / server components when APIs land.

## API adapter boundaries

All data access goes through [`src/services/api.ts`](../src/services/api.ts).

Today the service:

1. Clones seeded data from `src/data/seed.ts`
2. Applies small artificial latency
3. Mutates an in-memory copy for demo interactions

### Replacing mocks with production endpoints

1. Keep the same method signatures on `api` (or generate a typed client that matches them).
2. Swap implementations to `fetch` / RPC against your backend.
3. Leave UI components unchanged; they already depend on domain types in `src/types/domain.ts`.
4. Move auth session handling into Next.js middleware / server components as needed.
5. Preserve version immutability: never overwrite prior `ResumeVersion` records.

Suggested mapping:

| Service method | Future endpoint |
| --- | --- |
| `listApplications` | `GET /applications` |
| `createApplication` | `POST /applications` |
| `getResume` | `GET /applications/:id/resume` |
| `updateFinding` | `PATCH /audits/findings/:id` |
| `listEvidence` | `GET /evidence` |
| `updateInterview` | `PUT /interviews/:id` |

## Motion and accessibility

- Framer Motion for route fades, arcs, drawers, and progress
- `useReducedMotion` and CSS `prefers-reduced-motion` respected
- Skip link, landmarks, focus rings, dialog focus trap via Radix
- Icon-only controls include `aria-label` + tooltip

## How to rename CandidArc globally

1. Edit `src/config/product.ts` (`name`, `shortName`, `tagline`, `description`, `url`, `supportEmail`).
2. Update package/readme branding if desired (`package.json` name, `README.md`).
3. Avoid scattering the brand string in components—import `product` instead.

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```
