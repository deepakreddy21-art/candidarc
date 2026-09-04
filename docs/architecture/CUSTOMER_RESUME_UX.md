# Customer resume UX

The customer flow lives at `/app/resumes/*` and deliberately hides internal workflow and audit terminology. The API maps every nonterminal pipeline stage to “Creating your tailored resume…” and reports completion only after both PDF and DOCX files exist.

`POST /api/v1/resumes/generate` (alias: `/api/resumes/generate`) returns HTTP 202 with a `workflowId`, creates a normal application, and starts a durable workflow with `customerFacing` and `autoAdvanceAudits` metadata. It retains the full research, evidence matching, generation, four-audit, final QA, and rendering sequence. Audit findings are accepted automatically only for these flagged workflows; opportunity workspaces keep their review pauses.

Workers call `engine.recoverIncomplete()` on start so unfinished runs are re-enqueued after a process restart. Redis/BullMQ retains jobs across worker restarts; memory mode recovers from workflow records in the repository.

Final QA enqueues `pdf-rendering`. The renderer writes a valid text PDF and minimal OOXML DOCX, registers both stored files, and records their public IDs and paths in application metadata. Customer download endpoints verify the physical file before returning it.

Technology confirmations are optional. Exact technologies become claimable only after an affirmative answer with supporting evidence. “Similar”, “no”, “not sure”, and unanswered responses never authorize an exact technology claim. Late evidence after completion sets `enhancementAvailable` and can start a new immutable version via `/enhance`.

Refinement starts another immutable pipeline cycle. Customer history exposes only each cycle’s final, rendered version as Version 1, Version 2, and so on.

No additional database migration is required: customer resume state uses existing `workflow_runs`, applications metadata, resume versions, and stored files.
