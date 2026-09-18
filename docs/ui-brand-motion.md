# UI brand motion — requirement checklist

Starting SHA: `9b766396646fefdc9ab3b8ecc45796d72d66c495` (`origin/master`).  
Branch: `feature/ui-brand-motion`.

| Requirement | Implementation | Status |
| --- | --- | --- |
| Green/light tokens (white, forest, mint, lime, `#1F6F5B`) | `src/app/globals.css` | Done |
| Light-only; no dark flash / toggle | `providers.tsx` `forcedTheme="light"`; ThemeToggle no-op; preferences copy; command palette theme removed | Done |
| Logo default + inverse | `src/components/brand/logo.tsx` | Done |
| Signature arc story | `src/components/brand/arc-story.tsx` | Done |
| Layered résumé marketing depth | `src/components/brand/layered-resume-demo.tsx` | Done |
| Homepage narrative + copy | `src/app/page.tsx` | Done |
| Forest panel “The team uses Python…” white text | Homepage forest panel | Done |
| Demo player + lazy load | Homepage dialog; HEAD-check for MP4 | Done (MP4 optional) |
| 30–45s / 15s video assets | Storyboard + capture docs; poster/captions shipped | **MP4 incomplete** until local capture |
| Onboarding calm + 38/62 | `shell.tsx` mint aside, arc, deduped titles; step copy in `types.ts` | Done |
| Generation phases plain language | `creating-state.tsx` | Done |
| Jobs/Apps/Profile visual language | Shared tokens apply via canvas/surface/accent | Partial (tokens); page-level polish ongoing |
| Reduced motion | ArcStory settles; layered tilt disabled; CSS reduce rules | Done |
| ATS export unchanged | No resume HTML/PDF template changes | Done |
| Preserve import email / autosave behavior | No onboarding merge logic changed | Done |

## Limits

- Compressed MP4 product demo and vertical cut are **not** in `public/marketing/` yet. Player falls back to an accessible storyboard. See `docs/marketing-video.md`.
- Full screenshot/UAT pass and CI green are tracked in the PR report after push.
