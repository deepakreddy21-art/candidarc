import policy from "../../services/python-backend/app/prompts/resume-writing-policy.json";

/** Shared with Python generation, refinement, audits, and final QA. */
export const RESUME_WRITING_POLICY = `CandidArc resume writing policy (${policy.version}):\n${policy.rules.map((rule) => `- ${rule}`).join("\n")}`;
