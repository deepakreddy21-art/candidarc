import { createHash } from "crypto";
import { z } from "zod";
import { resumeSchema } from "../ai/schemas";
import { getEnv } from "../config/env";
import { AppError } from "../domain/types";
import { logger } from "../observability/logger";
import { PYTHON_BACKEND_PATHS } from "./generated/python-paths";
import {
  AuditFindingSchema,
  AuditResponseSchema,
  EvidenceItemSchema,
  EvidenceMatchResponseSchema,
  FinalQaResponseSchema,
  JobParseResponseSchema,
  ProviderUsageSchema,
  ResearchSynthesizeResponseSchema,
  ResumeDocumentSchema,
  ResumeGenerateResponseSchema,
  type AuditFinding,
  type EvidenceItem,
  type ProviderUsage,
  type ResumeDocument,
} from "./generated/python-schemas";

export type PythonResume = ResumeDocument;
export const pythonResumeSchema = ResumeDocumentSchema;

/** Python is the only supported backend. typescript/shadow are no longer valid. */
export type IntelligenceBackendMode = "python";

type RequestContext = {
  tenantId: string;
  userId: string;
  applicationId?: string;
  workflowRunId?: string;
  requestId: string;
};

export type MappedProviderUsage = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number | null;
  cachedTokens?: number;
  providerRequestId?: string;
  retryCount?: number;
  pricingTableVersion?: string | null;
  costUnknown?: boolean;
};

const SENSITIVE_DETAIL_KEY = /resume|evidence|job_description|token|authorization|api_key|password|secret/i;

export function sanitizeErrorDetails(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") return value.length > 200 ? value.slice(0, 200) : value;
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeErrorDetails(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_DETAIL_KEY.test(key)) continue;
      out[key] = sanitizeErrorDetails(nested, depth + 1);
    }
    return out;
  }
  return String(value).slice(0, 200);
}

export function isRetryableStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

export class PythonBackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly sanitizedMessage: string;
  readonly details: unknown;
  readonly retryable: boolean;

  constructor(opts: {
    status: number;
    code: string;
    sanitizedMessage: string;
    details?: unknown;
    retryable?: boolean;
  }) {
    super(opts.sanitizedMessage);
    this.name = "PythonBackendError";
    this.status = opts.status;
    this.code = opts.code;
    this.sanitizedMessage = opts.sanitizedMessage;
    this.details = sanitizeErrorDetails(opts.details ?? null);
    this.retryable = opts.retryable ?? isRetryableStatus(opts.status);
  }
}

/** Map Python backend failures to customer-safe AppErrors. */
export function mapPythonBackendErrorToAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (!(error instanceof PythonBackendError)) {
    return new AppError("PYTHON_BACKEND_UNAVAILABLE", "Resume intelligence service is unavailable", 503);
  }
  const { code, status, details, retryable } = error;
  if (code === "PROVIDER_OUTPUT_INVALID") {
    return new AppError("PROVIDER_OUTPUT_INVALID", "Provider returned invalid output", 422, details);
  }
  if (code === "GUARDRAIL_VIOLATION" || status === 422) {
    return new AppError(
      "GUARDRAIL_VIOLATION",
      "This request included unsupported or unverifiable claims. Please revise and try again.",
      422,
      details,
    );
  }
  if (code === "IDEMPOTENCY_KEY_REUSED" || (status === 409 && code === "IDEMPOTENCY_KEY_REUSED")) {
    return new AppError("IDEMPOTENCY_KEY_REUSED", "This request was already processed", 409, details);
  }
  if (code === "IDEMPOTENCY_IN_PROGRESS" || (status === 409 && code === "IDEMPOTENCY_IN_PROGRESS")) {
    return new AppError(
      "IDEMPOTENCY_IN_PROGRESS",
      "A matching request is already in progress",
      409,
      details,
      true,
    );
  }
  if (status === 401 || status === 403 || code === "PYTHON_BACKEND_AUTH") {
    logger.error({ status, code }, "python intelligence auth/config failure");
    return new AppError("PYTHON_BACKEND_AUTH", "Resume intelligence service is misconfigured", 503);
  }
  if (retryable || isRetryableStatus(status) || code === "PYTHON_BACKEND_CIRCUIT_OPEN") {
    return new AppError("PYTHON_BACKEND_UNAVAILABLE", "Resume intelligence service is unavailable", 503);
  }
  return new AppError("PYTHON_BACKEND_UNAVAILABLE", "Resume intelligence service is unavailable", 503);
}

type CircuitState = "closed" | "open" | "half_open";

function toSnakeContext(context: RequestContext) {
  return {
    tenant_id: context.tenantId,
    user_id: context.userId,
    application_id: context.applicationId,
    workflow_run_id: context.workflowRunId,
    request_id: context.requestId,
    schema_version: "2026-09-resume-intelligence.v1",
  };
}

function metricStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const rec = item as Record<string, unknown>;
        const label = typeof rec.label === "string" ? rec.label : "";
        const value = rec.value != null ? String(rec.value) : "";
        const unit = typeof rec.unit === "string" ? rec.unit : "";
        const joined = [label, value, unit].filter(Boolean).join(" ").trim();
        return joined || JSON.stringify(item).slice(0, 512);
      }
      return String(item);
    })
    .filter(Boolean)
    .slice(0, 50);
}

/** Map TS / mixed evidence into Python EvidenceItem (required fields always explicit). */
export function toSnakeEvidence(item: Record<string, unknown>): EvidenceItem {
  const confidenceRaw = item.confidence ?? "high";
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "medium" || confidenceRaw === "low"
      ? confidenceRaw
      : "high";
  const payload = (item.payload as Record<string, unknown> | undefined) ?? {};
  const mapped = {
    id: String(item.id ?? item.publicId ?? ""),
    tenant_id: String(item.tenantId ?? item.tenant_id ?? ""),
    owner_user_id: String(item.ownerUserId ?? item.owner_user_id ?? ""),
    title: String(item.title ?? ""),
    organization: (item.organization as string | null | undefined) ?? null,
    situation: (item.situation as string | null | undefined) ?? null,
    task: (item.task as string | null | undefined) ?? null,
    actions: Array.isArray(item.actions) ? (item.actions as string[]) : [],
    result: (item.result as string | null | undefined) ?? null,
    metrics: metricStrings(item.metrics ?? payload.metrics),
    technologies: Array.isArray(item.technologies) ? (item.technologies as string[]) : [],
    source_type: (item.sourceType ?? item.source_type ?? null) as string | null,
    verification_status: String(item.verificationStatus ?? item.verification_status ?? "user_attested"),
    candidate_confirmation_status: String(
      item.candidateConfirmationStatus ?? item.candidate_confirmation_status ?? "confirmed",
    ),
    confidence,
    privacy_classification: String(item.privacyLevel ?? item.privacy_classification ?? "share-safe"),
    claim_text: (item.claimText ?? item.claim_text ?? null) as string | null,
    employer_association: (item.employerAssociation ?? item.employer_association ?? null) as string | null,
    project_association: (item.projectAssociation ?? item.project_association ?? null) as string | null,
  };
  return EvidenceItemSchema.parse(mapped);
}

function toSnakeScoreBreakdown(raw: unknown) {
  const breakdown = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const score = Number(breakdown.atsCompatibility ?? breakdown.jobAlignment ?? 70);
  const num = (key: string) => Number(breakdown[key] ?? score);
  return {
    atsCompatibility: num("atsCompatibility"),
    jobAlignment: num("jobAlignment"),
    recruiterReadability: num("recruiterReadability"),
    impact: num("impact"),
    quantification: num("quantification"),
    technicalDepth: num("technicalDepth"),
    competencyCoverage: num("competencyCoverage"),
    evidenceConfidence: num("evidenceConfidence"),
    writingQuality: num("writingQuality"),
    formatIntegrity: num("formatIntegrity"),
  };
}

function toSnakeBullet(bullet: Record<string, unknown>) {
  return {
    text: String(bullet.text ?? ""),
    evidence_ids: (bullet.evidenceIds ?? bullet.evidence_ids ?? []) as string[],
    matched_requirements: (bullet.matchedRequirements ?? bullet.matched_requirements ?? []) as string[],
    technologies: (bullet.technologies ?? []) as string[],
    confidence: (bullet.confidence ?? "high") as "high" | "medium" | "low",
    claim_risk: (bullet.claimRisk ?? bullet.claim_risk ?? "low") as "low" | "medium" | "high",
    source_version: String(bullet.sourceVersion ?? bullet.source_version ?? "career-evidence"),
  };
}

export function toSnakeResume(resume: Record<string, unknown>): ResumeDocument {
  if ("absolute_version" in resume && "version_number" in resume && "score_breakdown" in resume) {
    return ResumeDocumentSchema.parse(resume);
  }
  const absolute = Number(resume.absoluteVersion ?? resume.absolute_version ?? resume.versionNumber ?? resume.version_number ?? 0);
  const cycleStep = Number(resume.cycleStep ?? resume.cycle_step ?? absolute % 5);
  const sections = Array.isArray(resume.sections) ? resume.sections : [];
  return ResumeDocumentSchema.parse({
    absolute_version: absolute,
    cycle_step: Math.min(4, Math.max(0, cycleStep)),
    version_number: absolute,
    score: Number(resume.score ?? 0),
    score_breakdown: toSnakeScoreBreakdown(resume.scoreBreakdown ?? resume.score_breakdown),
    score_rubric_version: resume.scoreRubricVersion ?? resume.score_rubric_version,
    score_explanations: resume.scoreExplanations ?? resume.score_explanations ?? {},
    notes: String(resume.notes ?? ""),
    sections: sections.map((section: Record<string, unknown>) => ({
      type: section.type,
      title: section.title,
      order: section.order ?? 0,
      content: section.content ?? null,
      bullets: Array.isArray(section.bullets)
        ? section.bullets.map((bullet: Record<string, unknown>) => toSnakeBullet(bullet))
        : null,
      items: Array.isArray(section.items)
        ? section.items.map((item: Record<string, unknown>) => ({
            heading: item.heading,
            subheading: item.subheading ?? null,
            location: item.location ?? null,
            dates: item.dates ?? null,
            bullets: Array.isArray(item.bullets)
              ? item.bullets.map((bullet: Record<string, unknown>) => toSnakeBullet(bullet))
              : [],
          }))
        : null,
    })),
  });
}

export function toSnakeFinding(finding: Record<string, unknown>): AuditFinding {
  const severityRaw = finding.severity;
  const severity =
    severityRaw === "nit"
      ? "suggestion"
      : severityRaw === "critical" || severityRaw === "major" || severityRaw === "minor" || severityRaw === "suggestion"
        ? severityRaw
        : "suggestion";
  return AuditFindingSchema.parse({
    severity,
    section: String(finding.section ?? ""),
    title: String(finding.title ?? ""),
    explanation: String(finding.explanation ?? ""),
    before_text: String(finding.beforeText ?? finding.before_text ?? ""),
    suggested_text: String(finding.suggestedText ?? finding.suggested_text ?? ""),
    expected_score_impact: Number(finding.expectedScoreImpact ?? finding.expected_score_impact ?? 0),
    evidence_source: (finding.evidenceSource ?? finding.evidence_source ?? null) as string | null,
    evidence_ids: (finding.evidenceIds ?? finding.evidence_ids ?? []) as string[],
    status: (finding.status ?? null) as AuditFinding["status"],
    rejection_reason: (finding.rejectionReason ?? finding.rejection_reason ?? null) as string | null,
    edited_text: (finding.editedText ?? finding.edited_text ?? null) as string | null,
  });
}

export function toSnakeMistakeMemory(rule: Record<string, unknown>) {
  const severityRaw = rule.severity;
  const severity =
    severityRaw === "nit"
      ? "suggestion"
      : severityRaw === "critical" || severityRaw === "major" || severityRaw === "minor" || severityRaw === "suggestion"
        ? severityRaw
        : "suggestion";
  return {
    category: String(rule.category ?? ""),
    rule: String(rule.rule ?? ""),
    severity,
    originating_audit: String(rule.originatingAudit ?? rule.originating_audit ?? "hr-1"),
    affected_version: String(rule.affectedVersion ?? rule.affected_version ?? "V0"),
  };
}

export function toSnakeResearchFinding(finding: Record<string, unknown>) {
  return {
    category: String(finding.category ?? "general"),
    title: String(finding.title ?? ""),
    summary: String(finding.summary ?? ""),
    confidence: (finding.confidence ?? "medium") as "high" | "medium" | "low",
    status: finding.status ?? "supported",
    source_ids: (finding.sourceIds ?? finding.source_ids ?? []) as string[],
  };
}

export function mapProviderUsage(usage: ProviderUsage | null | undefined): MappedProviderUsage {
  const parsed = usage ? ProviderUsageSchema.partial().passthrough().safeParse(usage) : null;
  const data = parsed?.success ? parsed.data : null;
  const estimatedCostCents =
    data?.estimated_cost_cents == null ? null : Number(data.estimated_cost_cents);
  const pricingRaw =
    data && typeof data === "object" && "pricing_table_version" in data
      ? (data as { pricing_table_version?: unknown }).pricing_table_version
      : undefined;
  const pricingTableVersion =
    pricingRaw == null ? null : typeof pricingRaw === "string" ? pricingRaw : String(pricingRaw);
  return {
    inputTokens: Number(data?.input_tokens ?? 0),
    outputTokens: Number(data?.output_tokens ?? 0),
    estimatedCostCents,
    cachedTokens: data?.cached_tokens == null ? undefined : Number(data.cached_tokens),
    providerRequestId: data?.provider_request_id ?? undefined,
    retryCount: data?.retry_count == null ? undefined : Number(data.retry_count),
    pricingTableVersion,
    costUnknown: estimatedCostCents == null,
  };
}

/** Map Python resume JSON into the TypeScript resumeSchema shape used by PDF/DOCX. */
export function mapPythonResumeToTs(resume: PythonResume) {
  const breakdown = resume.score_breakdown;
  const mapped = {
    versionNumber: resume.absolute_version,
    score: resume.score,
    scoreBreakdown: {
      atsCompatibility: breakdown.atsCompatibility,
      jobAlignment: breakdown.jobAlignment,
      recruiterReadability: breakdown.recruiterReadability,
      impact: breakdown.impact,
      quantification: breakdown.quantification,
      technicalDepth: breakdown.technicalDepth,
      competencyCoverage: breakdown.competencyCoverage,
      evidenceConfidence: breakdown.evidenceConfidence,
      writingQuality: breakdown.writingQuality,
      formatIntegrity: breakdown.formatIntegrity,
    },
    notes: resume.notes,
    sections: resume.sections.map((section) => ({
      type: section.type,
      title: section.title,
      order: section.order ?? 0,
      content: section.content ?? undefined,
      bullets: section.bullets?.map((bullet) => ({
        text: bullet.text,
        evidenceIds: bullet.evidence_ids,
        matchedRequirements: bullet.matched_requirements ?? [],
        technologies: bullet.technologies ?? [],
        confidence: bullet.confidence ?? "high",
        claimRisk: bullet.claim_risk ?? "low",
        sourceVersion: bullet.source_version ?? "career-evidence",
      })),
      items: section.items?.map((item) => ({
        heading: item.heading,
        subheading: item.subheading ?? undefined,
        location: item.location ?? undefined,
        dates: item.dates ?? undefined,
        bullets: (item.bullets ?? []).map((bullet) => ({
          text: bullet.text,
          evidenceIds: bullet.evidence_ids,
          matchedRequirements: bullet.matched_requirements ?? [],
          technologies: bullet.technologies ?? [],
          confidence: bullet.confidence ?? "high",
          claimRisk: bullet.claim_risk ?? "low",
          sourceVersion: bullet.source_version ?? "career-evidence",
        })),
      })),
    })),
  };
  return resumeSchema.parse(mapped);
}

function mapQaStatus(status: string): "pass" | "fail" | "warning" | "pending" {
  if (status === "warn" || status === "warning") return "warning";
  if (status === "fail") return "fail";
  if (status === "pending") return "pending";
  return "pass";
}

/** Sanitized shadow comparison — counts/scores/latency only, no resume text. */
export function compareResumeShapes(
  tsResume: { sections?: Array<Record<string, unknown>>; score?: number },
  pyResume: { sections?: Array<Record<string, unknown>>; score?: number },
  meta?: {
    tsLatencyMs?: number;
    pyLatencyMs?: number;
    tsUnsupportedClaims?: number;
    pyUnsupportedClaims?: number;
    tsEvidenceValidity?: number;
    pyEvidenceValidity?: number;
  },
) {
  const tsSections = tsResume.sections ?? [];
  const pySections = pyResume.sections ?? [];
  const countBullets = (sections: Array<Record<string, unknown>>) =>
    sections.reduce((sum, section) => {
      const bullets = Array.isArray(section.bullets) ? section.bullets.length : 0;
      const items = Array.isArray(section.items) ? section.items : [];
      const itemBullets = items.reduce((inner, item) => {
        const rec = item as Record<string, unknown>;
        return inner + (Array.isArray(rec.bullets) ? rec.bullets.length : 0);
      }, 0);
      return sum + bullets + itemBullets;
    }, 0);
  const countUnsupported = (sections: Array<Record<string, unknown>>) =>
    sections.reduce((sum, section) => {
      const bullets = Array.isArray(section.bullets) ? section.bullets : [];
      const items = Array.isArray(section.items) ? section.items : [];
      const fromBullets = bullets.filter((b) => {
        const rec = b as Record<string, unknown>;
        return rec.claimRisk === "high" || rec.claim_risk === "high" || rec.unsupported === true;
      }).length;
      const fromItems = items.reduce((inner, item) => {
        const rec = item as Record<string, unknown>;
        const itemBullets = Array.isArray(rec.bullets) ? rec.bullets : [];
        return (
          inner +
          itemBullets.filter((b) => {
            const bullet = b as Record<string, unknown>;
            return bullet.claimRisk === "high" || bullet.claim_risk === "high" || bullet.unsupported === true;
          }).length
        );
      }, 0);
      return sum + fromBullets + fromItems;
    }, 0);

  const tsUnsupported = meta?.tsUnsupportedClaims ?? countUnsupported(tsSections);
  const pyUnsupported = meta?.pyUnsupportedClaims ?? countUnsupported(pySections);
  return {
    sectionCountDiff: Math.abs(tsSections.length - pySections.length),
    bulletCountDiff: Math.abs(countBullets(tsSections) - countBullets(pySections)),
    tsSectionCount: tsSections.length,
    pySectionCount: pySections.length,
    tsBulletCount: countBullets(tsSections),
    pyBulletCount: countBullets(pySections),
    scoreDiff:
      tsResume.score != null && pyResume.score != null ? Math.abs(Number(tsResume.score) - Number(pyResume.score)) : null,
    tsScore: tsResume.score ?? null,
    pyScore: pyResume.score ?? null,
    unsupportedClaimsDiff: Math.abs(tsUnsupported - pyUnsupported),
    evidenceValidityDiff:
      meta?.tsEvidenceValidity != null && meta?.pyEvidenceValidity != null
        ? Math.abs(meta.tsEvidenceValidity - meta.pyEvidenceValidity)
        : null,
    latencyDiffMs:
      meta?.tsLatencyMs != null && meta?.pyLatencyMs != null ? Math.abs(meta.tsLatencyMs - meta.pyLatencyMs) : null,
  };
}

/** Deterministic shadow sampling — stable for the same seed. */
export function shouldSampleShadow(
  seed: string,
  samplePercent = getEnv().SHADOW_SAMPLE_PERCENT,
): boolean {
  const bounded = Math.min(100, Math.max(0, samplePercent));
  if (bounded <= 0) return false;
  if (bounded >= 100) return true;
  const bucket = createHash("sha256").update(seed).digest()[0]! % 100;
  return bucket < bounded;
}

/**
 * @deprecated Allowlist parsing is no longer used. All tenants use Python.
 */
function parseTenantAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

/**
 * Backend resolution for resume intelligence.
 * Python is the ONLY supported backend. Always returns "python".
 * The tenantId parameter is kept for API compatibility but is ignored.
 */
export function resolveIntelligenceBackendForTenant(_opts: {
  tenantId: string;
}): IntelligenceBackendMode {
  // Python is the only backend. No fallback, no allowlist, no kill switch.
  return "python";
}

const RESEARCH_CATEGORIES = new Set([
  "role",
  "company",
  "team",
  "project",
  "technology",
  "hiring-signal",
]);

/** Map Python research synthesize response into the TypeScript researchSchema shape. */
export function mapPythonResearchToTs(py: {
  findings: Array<{
    category: string;
    title: string;
    summary: string;
    confidence: "high" | "medium" | "low";
    status?: string;
    source_ids?: string[];
  }>;
  sources: Array<{
    id: string;
    url: string;
    title: string;
    accessed_at: string;
    supporting_text: string;
    confidence?: "high" | "medium" | "low";
    classification?: "explicit" | "inferred" | "uncertain";
    relevance?: number;
  }>;
  overall_confidence: number;
  company_research_status?: string | null;
}) {
  const statusMap: Record<string, "verified" | "inferred" | "unverified" | "disputed"> = {
    verified: "verified",
    supported: "verified",
    inferred: "inferred",
    uncertain: "inferred",
    unverified: "unverified",
    unavailable: "unverified",
    disputed: "disputed",
  };
  return {
    findings: py.findings.map((f) => ({
      category: (RESEARCH_CATEGORIES.has(f.category) ? f.category : "company") as
        | "role"
        | "company"
        | "team"
        | "project"
        | "technology"
        | "hiring-signal",
      title: f.title,
      summary: f.summary,
      confidence: f.confidence,
      status: statusMap[String(f.status ?? "inferred")] ?? "inferred",
      sourceIds: f.source_ids ?? [],
    })),
    sources: py.sources.map((s) => ({
      id: s.id,
      url: s.url,
      title: s.title,
      accessedAt: s.accessed_at,
      supportingText: s.supporting_text,
      confidence: s.confidence ?? "medium",
      classification: s.classification ?? "explicit",
      relevance:
        typeof s.relevance === "number"
          ? `relevance=${s.relevance.toFixed(2)}`
          : "Permitted public source collected for this job application",
    })),
    overallConfidence: Math.round(Math.min(1, Math.max(0, py.overall_confidence)) * 100),
    companyResearchStatus:
      py.company_research_status === "unavailable" ? ("unavailable" as const) : ("available" as const),
  };
}

/** Map Python evidence match response into the TypeScript evidenceMatchSchema shape. */
export function mapPythonEvidenceMatchToTs(py: {
  evidence_coverage: number;
  rows: Array<{
    requirement: string;
    importance?: "required" | "preferred" | "responsibility";
    evidence_ids: string[];
    evidence_strength: "strong" | "partial" | "none";
    resume_usage?: "use" | "consider" | "skip";
    coverage_gap?: string | null;
  }>;
}) {
  const strengthMap = {
    strong: "high" as const,
    partial: "medium" as const,
    none: "low" as const,
  };
  const usageMap = {
    use: "used" as const,
    consider: "partial" as const,
    skip: "unused" as const,
  };
  return {
    rows: py.rows.map((row) => ({
      requirement: row.requirement,
      importance: row.importance === "preferred" ? ("preferred" as const) : ("required" as const),
      evidenceIds: row.evidence_ids,
      evidenceStrength: strengthMap[row.evidence_strength] ?? "low",
      resumeUsage: usageMap[row.resume_usage ?? "consider"] ?? "partial",
      coverageGap: row.coverage_gap ?? undefined,
    })),
    evidenceCoverage: Math.round(Math.min(1, Math.max(0, py.evidence_coverage)) * 100),
  };
}

/** Map Python job parse into JobExtractionOutput. */
export function mapPythonJobParseToExtraction(py: {
  title?: string | null;
  company?: string | null;
  role?: string | null;
  location?: string | null;
  employment_type?: string | null;
  seniority?: string | null;
  required_qualifications?: string[];
  preferred_qualifications?: string[];
  responsibilities?: string[];
  target_technologies?: string[];
}) {
  return {
    title: py.title ?? undefined,
    company: py.company ?? undefined,
    role: py.role ?? undefined,
    location: py.location ?? undefined,
    employmentType: py.employment_type ?? undefined,
    seniority: py.seniority ?? undefined,
    requiredQualifications: py.required_qualifications ?? [],
    preferredQualifications: py.preferred_qualifications ?? [],
    responsibilities: py.responsibilities ?? [],
    targetTechnologies: py.target_technologies ?? [],
  };
}

export type GenerateResumeInput = {
  context: RequestContext;
  absoluteVersion: number;
  cycleStep: number;
  jobDescription: string;
  evidence: Array<Record<string, unknown>>;
  allowedTechnologies: string[];
  previousResume?: Record<string, unknown> | null;
  acceptedFindings?: Array<Record<string, unknown>>;
  rejectedFindings?: Array<Record<string, unknown>>;
  researchFindings?: Array<Record<string, unknown>>;
  mistakeMemory?: Array<Record<string, unknown>>;
  refinementInstruction?: string | null;
  jobRequirements?: string[];
  evidenceMatches?: Array<Record<string, unknown>>;
  userConfirmations?: Array<Record<string, unknown>>;
  idempotencyKey?: string;
};

function buildGenerateBody(input: GenerateResumeInput) {
  return {
    context: toSnakeContext(input.context),
    absolute_version: input.absoluteVersion,
    cycle_step: input.cycleStep,
    version_number: input.absoluteVersion,
    job_description: input.jobDescription,
    evidence: input.evidence.map((item) => toSnakeEvidence(item)),
    allowed_technologies: input.allowedTechnologies,
    previous_resume: input.previousResume ? toSnakeResume(input.previousResume) : null,
    accepted_findings: (input.acceptedFindings ?? []).map((finding) => toSnakeFinding(finding)),
    rejected_findings: (input.rejectedFindings ?? []).map((finding) => toSnakeFinding(finding)),
    research_findings: (input.researchFindings ?? []).map((finding) => toSnakeResearchFinding(finding)),
    mistake_memory: (input.mistakeMemory ?? []).map((rule) => toSnakeMistakeMemory(rule)),
    refinement_instruction: input.refinementInstruction ?? null,
    job_requirements: input.jobRequirements ?? [],
    evidence_matches: (input.evidenceMatches ?? []).map((row) => ({
      requirement: String(row.requirement ?? ""),
      importance: row.importance ?? "required",
      evidence_ids: (row.evidenceIds ?? row.evidence_ids ?? []) as string[],
      evidence_strength: row.evidenceStrength ?? row.evidence_strength ?? "none",
      resume_usage: row.resumeUsage ?? row.resume_usage ?? "use",
      coverage_gap: (row.coverageGap ?? row.coverage_gap ?? null) as string | null,
    })),
    user_confirmations: (input.userConfirmations ?? []).map((item) => ({
      topic: String(item.topic ?? item.technology ?? ""),
      confirmed: Boolean(item.confirmed ?? item.answer === "yes"),
      evidence_description: (item.evidenceDescription ?? item.evidence_description ?? null) as string | null,
      source_kind: item.sourceKind ?? item.source_kind ?? "user_confirmation",
      related_evidence_ids: (item.relatedEvidenceIds ?? item.related_evidence_ids ?? []) as string[],
    })),
  };
}

export class PythonIntelligenceClient {
  private failures = 0;
  private openedAt = 0;
  private circuitState: CircuitState = "closed";

  constructor(
    private readonly baseUrl = getEnv().PYTHON_BACKEND_URL,
    private readonly token = getEnv().PYTHON_BACKEND_TOKEN,
    private readonly timeoutMs = 60_000,
  ) {}

  /** Test helper — current circuit breaker state. */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }

  private assertCircuitAllowsRequest() {
    if (this.circuitState === "open") {
      if (Date.now() - this.openedAt >= 30_000) {
        this.circuitState = "half_open";
        return;
      }
      throw new PythonBackendError({
        status: 0,
        code: "PYTHON_BACKEND_CIRCUIT_OPEN",
        sanitizedMessage: "Python intelligence circuit is open",
        retryable: true,
      });
    }
  }

  private recordSuccess() {
    this.circuitState = "closed";
    this.failures = 0;
  }

  private recordRetryableFailure() {
    if (this.circuitState === "half_open") {
      this.circuitState = "open";
      this.openedAt = Date.now();
      return;
    }
    this.failures += 1;
    if (this.failures >= 5) {
      this.circuitState = "open";
      this.openedAt = Date.now();
    }
  }

  /** On-demand readiness probe — not called before every request. */
  async ready(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}${PYTHON_BACKEND_PATHS.healthReady}`, {
        signal: AbortSignal.timeout(5_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async parseResume(input: {
    context: RequestContext;
    filename: string;
    contentType: string;
    contentBase64: string;
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.resumesParse, {
      context: toSnakeContext(input.context),
      filename: input.filename,
      content_type: input.contentType,
      content_base64: input.contentBase64,
    });
    return z
      .object({
        text: z.string(),
        page_count: z.number().nullable().optional(),
        warnings: z.array(z.string()).default([]),
      })
      .parse(data);
  }

  async parseJob(input: {
    context: RequestContext;
    jobText: string;
    company?: string;
    role?: string;
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.jobsParse, {
      context: toSnakeContext(input.context),
      job_text: input.jobText,
      company: input.company,
      role: input.role,
    });
    return JobParseResponseSchema.parse(data);
  }

  async synthesizeResearch(input: {
    context: RequestContext;
    company: string;
    role: string;
    jobDescription: string;
    sources?: Array<Record<string, unknown>>;
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.researchSynthesize, {
      context: toSnakeContext(input.context),
      company: input.company,
      role: input.role,
      job_description: input.jobDescription,
      sources: input.sources ?? [],
    });
    return ResearchSynthesizeResponseSchema.parse(data);
  }

  async indexEvidence(input: { context: RequestContext; evidence: Array<Record<string, unknown>> }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.evidenceIndex, {
      context: toSnakeContext(input.context),
      evidence: input.evidence.map((item) => toSnakeEvidence(item)),
    });
    return z
      .object({
        indexed: z.number(),
        tenant_id: z.string(),
        owner_user_id: z.string(),
      })
      .parse(data);
  }

  async searchEvidence(input: {
    context: RequestContext;
    query: string;
    ownerUserId: string;
    limit?: number;
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.evidenceSearch, {
      context: toSnakeContext(input.context),
      query: input.query,
      owner_user_id: input.ownerUserId,
      limit: input.limit ?? 8,
    });
    return z
      .object({
        hits: z.array(
          z.object({
            evidence_id: z.string(),
            score: z.number(),
            snippet: z.string(),
          }),
        ),
      })
      .parse(data);
  }

  async matchEvidence(input: {
    context: RequestContext;
    requirements: string[];
    evidence: Array<Record<string, unknown>>;
    researchFindings?: Array<Record<string, unknown>>;
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.evidenceMatch, {
      context: toSnakeContext(input.context),
      requirements: input.requirements,
      evidence: input.evidence.map((item) => toSnakeEvidence(item)),
      research_findings: (input.researchFindings ?? []).map((finding) => toSnakeResearchFinding(finding)),
    });
    return EvidenceMatchResponseSchema.parse(data);
  }

  async generateResume(input: GenerateResumeInput) {
    const data = await this.post(
      PYTHON_BACKEND_PATHS.resumesGenerate,
      buildGenerateBody(input),
      input.idempotencyKey,
    );
    return this.mapGenerateResponse(data);
  }

  async regenerateResume(input: GenerateResumeInput) {
    const data = await this.post(
      PYTHON_BACKEND_PATHS.resumesRegenerate,
      buildGenerateBody(input),
      input.idempotencyKey,
    );
    return this.mapGenerateResponse(data);
  }

  private mapGenerateResponse(data: Record<string, unknown>) {
    const parsed = ResumeGenerateResponseSchema.parse(data);
    const usage = mapProviderUsage(parsed.usage);
    return {
      resume: mapPythonResumeToTs(parsed.resume),
      absoluteVersion: parsed.resume.absolute_version,
      cycleStep: parsed.resume.cycle_step,
      provider: parsed.provider,
      model: parsed.model,
      promptVersion: parsed.prompt_version,
      latencyMs: parsed.latency_ms,
      usage,
    };
  }

  async auditResume(input: {
    context: RequestContext;
    lens: "hr-1" | "em-1" | "hr-2" | "em-2";
    reviewsVersion: number;
    producesVersion: number;
    resume: Record<string, unknown>;
    evidence: Array<Record<string, unknown>>;
    jobDescription: string;
    allowedTechnologies?: string[];
    idempotencyKey?: string;
  }) {
    const data = await this.post(
      PYTHON_BACKEND_PATHS.resumesAudit,
      {
        context: toSnakeContext(input.context),
        lens: input.lens,
        reviews_version: input.reviewsVersion,
        produces_version: input.producesVersion,
        resume: toSnakeResume(input.resume),
        evidence: input.evidence.map((item) => toSnakeEvidence(item)),
        job_description: input.jobDescription,
        allowed_technologies: input.allowedTechnologies ?? [],
      },
      input.idempotencyKey,
    );
    const parsed = AuditResponseSchema.parse(data);
    const usage = mapProviderUsage(parsed.usage);
    return {
      data: {
        lens: parsed.lens,
        reviewsVersion: parsed.reviews_version,
        producesVersion: parsed.produces_version,
        scoreBefore: parsed.score_before,
        scoreAfter: parsed.score_after,
        summary: parsed.summary,
        findings: parsed.findings.map((finding) => ({
          severity: finding.severity,
          section: finding.section,
          title: finding.title,
          explanation: finding.explanation,
          beforeText: finding.before_text,
          suggestedText: finding.suggested_text,
          expectedScoreImpact: finding.expected_score_impact,
          evidenceSource: finding.evidence_source ?? undefined,
        })),
        rejectedFindings: (parsed.rejected_findings ?? []).map((finding) => ({
          severity: finding.severity,
          section: finding.section,
          title: finding.title,
          explanation: finding.explanation,
          beforeText: finding.before_text,
          suggestedText: finding.suggested_text,
          expectedScoreImpact: finding.expected_score_impact,
          evidenceSource: finding.evidence_source ?? undefined,
          rejectionReason: finding.rejection_reason ?? undefined,
        })),
      },
      provider: parsed.provider,
      model: parsed.model,
      latencyMs: parsed.usage?.latency_ms ?? 0,
      usage,
    };
  }

  async finalQa(input: {
    context: RequestContext;
    resume: Record<string, unknown>;
    evidence: Array<Record<string, unknown>>;
    deterministicChecks?: Array<Record<string, unknown>>;
    allowedTechnologies?: string[];
    idempotencyKey?: string;
  }) {
    const data = await this.post(
      PYTHON_BACKEND_PATHS.resumesFinalQa,
      {
        context: toSnakeContext(input.context),
        resume: toSnakeResume(input.resume),
        evidence: input.evidence.map((item) => toSnakeEvidence(item)),
        deterministic_checks: (input.deterministicChecks ?? []).map((check) => ({
          label: String(check.label ?? ""),
          status: check.status ?? "pass",
          detail: String(check.detail ?? ""),
        })),
        allowed_technologies: input.allowedTechnologies ?? [],
      },
      input.idempotencyKey,
    );
    const parsed = FinalQaResponseSchema.parse(data);
    const usage = mapProviderUsage(parsed.usage);
    return {
      data: {
        passed: parsed.passed,
        checks: parsed.checks.map((check) => ({
          label: check.label,
          status: mapQaStatus(check.status),
          detail: check.detail,
        })),
      },
      provider: parsed.provider,
      model: parsed.model,
      latencyMs: parsed.usage?.latency_ms ?? 0,
      usage,
    };
  }

  private async post(path: string, body: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    this.assertCircuitAllowsRequest();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      };
      if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;

      let response: Response;
      try {
        response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (error) {
        const aborted =
          controller.signal.aborted ||
          (error instanceof Error && (error.name === "AbortError" || /aborted|timeout/i.test(error.message)));
        const pyError = new PythonBackendError({
          status: 0,
          code: aborted ? "PYTHON_BACKEND_TIMEOUT" : "PYTHON_BACKEND_UNAVAILABLE",
          sanitizedMessage: aborted
            ? "Python intelligence request timed out"
            : "Python intelligence backend unavailable",
          retryable: true,
        });
        this.recordRetryableFailure();
        logger.warn(
          { path, status: pyError.status, code: pyError.code, retryable: pyError.retryable },
          "python intelligence request failed",
        );
        throw pyError;
      }

      let json: Record<string, unknown> = {};
      const rawText = await response.text();
      if (rawText.trim()) {
        try {
          const parsed = JSON.parse(rawText) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            json = parsed as Record<string, unknown>;
          }
        } catch {
          json = {};
        }
      }

      if (!response.ok) {
        const detail = (json.detail ?? {}) as {
          code?: string;
          message?: string;
          [key: string]: unknown;
        };
        const code =
          typeof detail.code === "string" && detail.code
            ? detail.code
            : `PYTHON_BACKEND_${response.status}`;
        const sanitizedMessage =
          typeof detail.message === "string" && detail.message
            ? detail.message.slice(0, 200)
            : `Python backend error ${response.status}`;
        // In-progress is workflow-retryable but proves the backend is reachable — never trips the circuit.
        const inProgress = code === "IDEMPOTENCY_IN_PROGRESS";
        const pyError = new PythonBackendError({
          status: response.status,
          code,
          sanitizedMessage,
          details: detail,
          retryable: inProgress || isRetryableStatus(response.status),
        });
        if (pyError.retryable && !inProgress) {
          this.recordRetryableFailure();
        } else {
          // Reachable non-infra response (incl. 409 in-progress / validation).
          this.recordSuccess();
        }
        logger.warn(
          { path, status: pyError.status, code: pyError.code, retryable: pyError.retryable },
          "python intelligence request failed",
        );
        throw pyError;
      }

      this.recordSuccess();
      return json;
    } finally {
      clearTimeout(timer);
    }
  }
}

let singleton: PythonIntelligenceClient | null = null;

export function getPythonIntelligenceClient() {
  if (!singleton) singleton = new PythonIntelligenceClient();
  return singleton;
}

export function resetPythonIntelligenceClient() {
  singleton = null;
}

/**
 * Returns the resume intelligence backend mode.
 * Python is the only supported backend.
 */
export function getResumeIntelligenceBackend(): IntelligenceBackendMode {
  return "python";
}
