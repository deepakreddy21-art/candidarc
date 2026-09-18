# Resume import: structural parsing without a paid API

The import path continues to use the Python PDF/DOCX parser. This correction
does not add an AI provider call, model, key, dependency, or schema migration.
Resume generation and its existing provider configuration are separate.

## Failure and correction

The importer previously truncated compound finance titles to recognized title
fragments. It then failed to see subsequent job boundaries and attached several
employers' responsibilities to a single unnamed job. Education text such as
`Master of Science, Finance` could also be classified as a location.

The parser now uses independent header cells before title-token heuristics.
Pipes, tabs, aligned columns, separate lines, date ranges and location boundaries
identify records. Internal title punctuation stays part of the title. Employers
and cities are extracted from the source, not filled from an allowlist.

Additional layout corrections:

- Short responsibility subsection captions stay in source provenance instead
  of becoming job headers or being appended to responsibility bullets.
- Consecutive jobs remain separate even if the first job has no responsibilities.
- Ambiguous dated records remain separate, with review warnings.
- Letter-spaced PDF section headings are matched to complete known aliases.
- A header location wrapped after a comma is joined before assigning fields.
- A degree with a comma-separated major, Bachelor of Commerce and abbreviated
  degrees immediately followed by `in` retain their correct fields.
- Thesis/dissertation descriptions stay attached to the qualification.
- Word skill tables and PDF category columns retain categories and wrapped
  compound skill names. Ordinary flat skill lists remain flat.

## Regression evidence

`tests/fixtures/finance_resume.py` generates fictional DOCX and PDF files. The
DOCX uses a real table and native Word lists. The PDF has letter-spaced headings,
aligned fields, multiple pages and a wrapped location. No private resume is
committed.

`tests/unit/test_resume_compound_records.py` asserts exact employer/title/date
tuples, job-specific responsibility counts, two correctly structured education
records, three projects, skill categories and uncertainty handling. Other cases
cover different header orders, unseen employers, internships, shared layouts,
empty jobs, academic descriptions and flat skill lists.

`src/test/onboarding-resume-import-journey.test.ts` sends both file formats through
the real upload/scan/parse/confirm routes and a real FastAPI server. It verifies
that reloaded extraction and the production profile form mapper preserve the
same records. These tests run in the existing `python-mode` CI job.

## Limits and local verification

This is deterministic document parsing, not a general language model. Unknown
headings, missing text layers and genuinely ambiguous identity boundaries still
require review. OCR for image-only PDFs is still unsupported and explicitly
reported. Missing facts are not invented. This change does not establish perfect
accuracy across every language or resume template.

Update the feature branch in the local worktree, restart the Python process,
then replace/re-upload the document. Already saved extractions are not silently
rewritten. `npm run dev` starts the Python service without auto-reload, so stop
and restart that stack after pulling. A built deployment needs rebuilt/restarted
services; changing a remote branch does not update an already running local app.
