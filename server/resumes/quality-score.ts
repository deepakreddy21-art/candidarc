/** Local writing review, evidence-link checks, and separately labeled AI estimates. */
import { createHash } from "node:crypto";
import { collectReviewBullets, reviewResumeWriting, type WritingReview } from "../../src/lib/resume-writing-review";

export type QualityCheckKind = "verified" | "heuristic" | "ai_estimate" | "not_evaluated";
export type QualityCheck = {
  id: string;
  label: string;
  kind: QualityCheckKind;
  passed: boolean;
  detail: string;
  weight: number;
  score: number;
};
export type CandidArcQualityReport = {
  name: "CandidArc Quality Score";
  rubricVersion: string;
  inputFingerprint: string;
  score: number;
  summary: string;
  checks: QualityCheck[];
  writingReview: WritingReview;
  passed: string[];
  missing: string[];
  verifiedConclusions: string[];
  aiEstimates: string[];
  nextSteps: string[];
  roleAlignment?: number;
  atsReadability?: number;
  /** Compatibility field: evidence-linked bullets, not independently verified facts. */
  verifiedClaims?: number;
  remainingSkillGaps?: string[];
};

function check(id: string, label: string, kind: QualityCheckKind, passed: boolean, score: number, detail: string, weight = 1): QualityCheck {
  return { id, label, kind, passed, score, detail, weight };
}

export function computeCandidArcQualityScore(input: {
  sections: Array<Record<string, unknown>>;
  contact?: QualityContact;
  jobRequirements?: string[];
  knownTechnologies?: string[];
  /** Actual exported PDF pages only; omit when not yet rendered. */
  pageCount?: number;
  preferredLength?: "one-page" | "two-page" | string;
  aiRoleAlignment?: number;
  aiAtsReadability?: number;
}): CandidArcQualityReport {
  const writingReview = reviewResumeWriting(input);
  const bullets = collectReviewBullets(input.sections);
  const requirements = [...new Set((input.jobRequirements ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  const allText = [
    ...bullets.map((bullet) => bullet.text),
    ...input.sections.map((section) => typeof section.content === "string" ? section.content : ""),
  ].join("\n").toLowerCase();
  const remainingSkillGaps = requirements.filter((requirement) => !allText.includes(requirement));
  const linked = bullets.filter(({ source }) => Array.isArray(source.evidenceIds) && source.evidenceIds.length > 0).length;
  const flagged = bullets.filter(({ source }) => source.unsupported === true || source.claimRisk === "high").length;
  const contactFields = [input.contact?.email, input.contact?.phone, input.contact?.location].filter((value) => value?.trim()).length;
  const measured = Number.isInteger(input.pageCount) && (input.pageCount ?? 0) > 0;
  const checks: QualityCheck[] = writingReview.criteria.slice(0, 5).map((criterion) => {
    const count = writingReview.findings.filter((finding) => finding.criterion === criterion.id).length;
    const evaluated = criterion.status !== "not_evaluated";
    return check(criterion.id, criterion.label, evaluated ? "heuristic" : "not_evaluated", criterion.status === "clear",
      evaluated ? Math.max(0, 100 - Math.round(count / Math.max(1, writingReview.bulletCount) * 100)) : 0,
      criterion.detail, evaluated && criterion.id !== "length" ? 1 : 0);
  });
  checks.push(
    check("job_coverage", "Job wording coverage", requirements.length ? "heuristic" : "not_evaluated", remainingSkillGaps.length === 0, 0,
      requirements.length ? `${requirements.length - remainingSkillGaps.length}/${requirements.length} supplied phrases occur in the text. This does not prove qualification or ATS ranking.` : "Not evaluated — no job requirements supplied.", 0),
    check("verified_claims", "Evidence links", "verified", linked === bullets.length && bullets.length > 0, 0,
      `${linked}/${bullets.length} bullets cite evidence IDs. Links alone do not establish factual support.`, 0),
    check("unsupported", "Claims flagged for review", "verified", flagged === 0, 0,
      flagged ? `${flagged} bullet(s) carry an unsupported/high-risk flag.` : "No stored unsupported/high-risk flags. Factual checks run separately in the generation pipeline.", 0),
    check("page_count", "Rendered PDF length", measured ? "verified" : "not_evaluated", measured, 0,
      measured ? `${input.pageCount} page(s), measured from the PDF. Word pagination may differ.` : "Not measured — no rendered PDF page count available.", 0),
    check("contact", "Required contact details", "verified", contactFields === 3, contactFields / 3 * 100,
      `${contactFields}/3 required contact fields present (email, phone, location). LinkedIn, GitHub, and portfolio are optional.`),
    check("ats_order", "External ATS parsing", "not_evaluated", false, 0, "Not tested against an external ATS or VMock parser.", 0),
    check("dates", "Date consistency", "not_evaluated", false, 0, "Not established by this writing review; verify dates against the source profile.", 0),
    check("formatting", "Document integrity", "not_evaluated", false, 0, "PDF/DOCX extraction and layout checks run separately during export.", 0),
  );
  for (const [id, label, value] of [
    ["ai_role_alignment", "Role alignment", input.aiRoleAlignment],
    ["ai_ats", "ATS readability", input.aiAtsReadability],
  ] as const) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const score = Math.min(100, Math.max(0, value));
      checks.push(check(id, label, "ai_estimate", score >= 70, score, `AI estimate: ${score}/100; not an external ATS result.`, 0));
    }
  }
  const scored = checks.filter((item) => item.weight > 0);
  const weight = scored.reduce((sum, item) => sum + item.weight, 0);
  const score = weight ? Math.round(scored.reduce((sum, item) => sum + item.score * item.weight, 0) / weight) : 0;
  const evaluated = checks.filter((item) => item.kind !== "not_evaluated");
  return {
    name: "CandidArc Quality Score",
    rubricVersion: writingReview.rubricVersion,
    inputFingerprint: createHash("sha256").update(JSON.stringify(input)).digest("hex"),
    score,
    summary: "Local writing and contact checks only; suggestions are advisory. Competency wording is not proof of ability. This is not a VMock score or a prediction of hiring success.",
    checks, writingReview,
    passed: evaluated.filter((item) => item.passed).map((item) => item.label),
    missing: evaluated.filter((item) => !item.passed).map((item) => `${item.label}: ${item.detail}`),
    verifiedConclusions: checks.filter((item) => item.kind === "verified").map((item) => `${item.label} — ${item.detail}`),
    aiEstimates: checks.filter((item) => item.kind === "ai_estimate").map((item) => `${item.label} — ${item.detail}`),
    nextSteps: [...new Set(writingReview.findings.map((finding) => finding.message))].slice(0, 5),
    roleAlignment: input.aiRoleAlignment,
    atsReadability: input.aiAtsReadability,
    verifiedClaims: linked,
    remainingSkillGaps: remainingSkillGaps.slice(0, 8),
  };
}

export type QualityContact = {
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  linkedIn?: string | null;
};

export type PersistedQualityReport = CandidArcQualityReport & {
  versionPublicId: string;
  computedAt: string;
  contactFingerprint: string;
};

export function qualityContactFromSnapshot(input: {
  metadata?: Record<string, unknown> | null;
  location?: string | null;
}): QualityContact {
  const metadata = input.metadata ?? {};
  const locationFromMeta =
    typeof metadata.candidateLocation === "string" && metadata.candidateLocation.trim()
      ? metadata.candidateLocation
      : undefined;
  const location = locationFromMeta ?? (typeof input.location === "string" && input.location.trim() ? input.location : undefined);
  return {
    email: typeof metadata.candidateEmail === "string" ? metadata.candidateEmail : undefined,
    phone: typeof metadata.candidatePhone === "string" ? metadata.candidatePhone : undefined,
    location,
    linkedIn: typeof metadata.candidateLinkedIn === "string" ? metadata.candidateLinkedIn : undefined,
  };
}

export function contactFingerprint(contact?: QualityContact): string {
  const norm = (value?: string | null) => (value ?? "").trim().toLowerCase();
  return [norm(contact?.email), norm(contact?.phone), norm(contact?.location), norm(contact?.linkedIn)].join("|");
}

export function attachQualityProvenance(
  report: CandidArcQualityReport,
  input: { versionPublicId: string; contact?: QualityContact; computedAt?: string },
): PersistedQualityReport {
  return {
    ...report,
    versionPublicId: input.versionPublicId,
    computedAt: input.computedAt ?? new Date().toISOString(),
    contactFingerprint: contactFingerprint(input.contact),
  };
}

export function selectFreshQualityReport(
  persisted: unknown,
  fresh: PersistedQualityReport,
): PersistedQualityReport {
  if (!persisted || typeof persisted !== "object") return fresh;
  const row = persisted as Record<string, unknown>;
  if (row.rubricVersion !== fresh.rubricVersion || row.inputFingerprint !== fresh.inputFingerprint) return fresh;
  if (row.versionPublicId !== fresh.versionPublicId) return fresh;
  if (row.contactFingerprint !== fresh.contactFingerprint) return fresh;
  return persisted as PersistedQualityReport;
}
