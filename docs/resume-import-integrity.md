# Resume import integrity — notes

Branch: `fix/resume-import-integrity`  
Starting SHA: `9b766396646fefdc9ab3b8ecc45796d72d66c495` (`origin/master`)  
Worktree: `C:\Users\deepa\Desktop\CandidArc-import-integrity`  
UI brand work preserved on `feature/ui-brand-motion` (`CandidArc-ui-brand`).

## Root causes (UAT PDF)

| Symptom | Cause | Fix |
| --- | --- | --- |
| ~29–35 employment roles | `_chunk_experience` treated every short non-bullet wrap line as a new role header; commas in fragments became title/employer | Reflow wrapped bullets; require title/pipe/date evidence for role headers |
| Name `… \| Java Mechanic` | First header line taken whole | Split pipe name vs headline |
| Education institution = field of study | `Degree \| Field \| Institution, Location` parsed as degree/institution/field | Pipe-aware education parser |
| Save failed | Autosave Zod rejected `employment.max(30)` (35 roles) and `skills.max(60)` (64 skills) | Correct extraction + raise skills draft limit to 200 |

Private UAT PDF stays in ignored `.tmp-import-uat/`. CI uses de-identified `WRAPPED_BULLET_EMPLOYMENT_RESUME`.
