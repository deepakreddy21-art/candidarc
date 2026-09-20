# CandidArc Classic v1

Default template for newly generated résumés. Based on the approved résumé references, not affiliated with or certified by MIT, Google, Microsoft or another employer.

## Layout contract

`src/lib/resume-template.ts` owns the physical measurements shared by HTML/PDF and Word:

- US Letter (612 × 792 pt), single column, black text on white.
- 44.64 pt side margins; 36.5 pt top / 36 pt bottom margin.
- Liberation Serif regular, bold, italic and bold italic (Times-compatible metrics), embedded from local font assets.
- Centered 19.925 pt bold name; centered 10.162 pt contact lines.
- Location, phone and email on the first contact line; optional labeled links on the next.
- 0.548 pt horizontal divider, centered 11.158 pt uppercase section headings.
- 10.262 pt body with 11.756 pt target leading; 13.054 pt bullet text indent and 3.139 pt inter-bullet spacing.
- Employer/institution/project name on the left, dates on the right; role/degree below on the left, location on the right.
- Professional summary, experience, projects, skills, education, certifications, publications; missing sections omitted. Existing titles are retained.
- Skills categories before a colon use bold labels. Certifications in paragraph form are centered and bold.
- Publications use the same heading and entry system, with only supplied titles/authors/venues/dates/URLs.

The original was typeset with an older Nimbus Roman/LaTeX engine. Liberation Serif retains the classic Times-style design and permits editable font embedding, but browser and Word shaping are not byte-for-byte LaTeX reproduction. Word rounds sizes to half-points and measurements to twentieths of a point. Its line/page breaks may differ by application. PDF is the fixed-layout download. Both formats preserve the same content; no text is truncated or shrunk to force a page count.

## Data and rendering

- Imported and manually reviewed profile data remains unchanged. This change adds no profile writes or data migration.
- `buildResumeDocument` maps tailored version sections into the canonical layout, removes genuinely empty optional entries and sets template metadata.
- New résumé records use `candidarc-classic-v1`. Historical database IDs/files remain untouched. Regenerating an artifact uses the current renderer; old stored downloads are not silently rewritten.
- Preview and PDF share HTML. Print margins are applied once through `@page`; preview padding represents those margins on screen.
- PDF embeds font data inline, waits for fonts, and verifies extracted text for all contact fields, all section content and all entries/bullets. It never accepts raw PDF bytes as text evidence.
- Chromium failure, missing canonical content or a blank page returns retryable `PDF_RENDER_FAILED`. It cannot silently change to a plain-text design. DOCX remains independently available.
- Three or more pages produces a length warning, never content deletion. Browser preview grows with its content and provides horizontal scrolling when zoomed on a small screen.
- Optional web links accept HTTP/HTTPS only; user content is escaped.

## Runtime requirements

Install the document renderer with `npx playwright install --with-deps chromium`. The document-worker Docker image and relevant CI jobs install it. The four font assets must travel with the app in `public/fonts/resume`; Next tracing includes them. Fonts are cached once per process.

`RESUME_PDF_BROWSER_PATH` optionally points to an already-installed compatible Chromium executable. Leave it unset for Playwright's pinned Chromium in normal deployments. An unavailable browser produces an explicit export error, not an altered résumé.

Font attribution and the SIL Open Font License are in `public/fonts/resume/LICENSE.txt`. Files are unmodified Liberation Serif TrueType fonts distributed with LibreOffice; their OS/2 embedding permissions allow installable embedding (`fsType=0`). The original Nimbus face was not bundled because its embedding flags restrict editing.

## Verification

- `npm test` includes `resume-classic-template.test.ts`, existing document/parity tests and the rest of the application tests.
- Regression coverage checks complete sections, all four embedded Word font faces, later employers/education/publications, missing Unicode text, long names/URLs, inert unsafe links, empty optional sections and independent format failure.
- `node --import tsx scripts/preview-resume-template.ts` generates synthetic standard, long and sparse HTML/PDF/DOCX samples in ignored `tmp-e2e/resume-template/` for visual review. No personal reference résumé is committed.
- Review every generated page, and inspect Word output in the target Word application before release. LibreOffice rendering is useful validation but does not promise identical pagination in every Word version.

### Implementation verification (2026-09-20)

- TypeScript unit suite: 473 passed, 6 existing skipped. Focused final-font export tests: 24 passed, 1 existing opt-in Chromium test skipped; the new non-optional render tests exercised Chromium.
- Python unit suite: 299 passed. Ruff, mypy and OpenAPI drift check passed.
- Python-mode/import journeys: 25 passed across the two runner phases. Production journey: 4 passed.
- TypeScript typecheck and lint passed (repository-wide lint has existing warnings).
- Synthetic standard and sparse samples: one page each in PDF and LibreOffice-rendered DOCX. Long sample: three pages in both. All pages visually inspected and every canonical text value checked against extracted text in both formats.
- Local PDF verification used the available Chromium 131 through `RESUME_PDF_BROWSER_PATH`; CI uses Playwright's pinned Chromium. DOCX was inspected through LibreOffice, not a live Microsoft Word installation.
- No real-provider AI calls, production database writes or personal résumé uploads were required for this template change. Font metrics/page breaks can vary in different Word applications; inspect the final PDF before sending it to an employer.
