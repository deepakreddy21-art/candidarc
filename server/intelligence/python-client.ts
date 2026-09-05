import { z } from "zod";
import { getEnv } from "../config/env";
import { logger } from "../observability/logger";
import { PYTHON_BACKEND_PATHS } from "./generated/python-paths";

const resumeBulletSchema = z.object({
  text: z.string(),
  evidence_ids: z.array(z.string()).default([]),
  matched_requirements: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  confidence: z.enum(["high", "medium", "low"]).default("high"),
  claim_risk: z.enum(["low", "medium", "high"]).default("low"),
  source_version: z.string().default("career-evidence"),
});

const resumeSectionSchema = z.object({
  type: z.enum(["summary", "skills", "experience", "projects", "education", "certifications", "other"]),
  title: z.string(),
  order: z.number().int().default(0),
  content: z.string().optional().nullable(),
  bullets: z.array(resumeBulletSchema).optional().nullable(),
  items: z
    .array(
      z.object({
        heading: z.string(),
        subheading: z.string().optional().nullable(),
        location: z.string().optional().nullable(),
        dates: z.string().optional().nullable(),
        bullets: z.array(resumeBulletSchema).default([]),
      }),
    )
    .optional()
    .nullable(),
});

export const pythonResumeSchema = z.object({
  version_number: z.number().int().min(0).max(4),
  score: z.number(),
  score_breakdown: z.record(z.string(), z.number()),
  notes: z.string(),
  sections: z.array(resumeSectionSchema),
});

export type PythonResume = z.infer<typeof pythonResumeSchema>;

const pythonAuditSchema = z.object({
  lens: z.enum(["hr-1", "em-1", "hr-2", "em-2"]),
  reviews_version: z.number().int(),
  produces_version: z.number().int(),
  score_before: z.number(),
  score_after: z.number(),
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(["critical", "major", "minor", "nit"]),
      section: z.string(),
      title: z.string(),
      explanation: z.string(),
      before_text: z.string(),
      suggested_text: z.string(),
      expected_score_impact: z.number(),
      evidence_source: z.string().nullable().optional(),
    }),
  ),
  provider: z.string(),
  model: z.string(),
});

const pythonFinalQaSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      label: z.string(),
      status: z.enum(["pass", "warn", "fail"]),
      detail: z.string(),
    }),
  ),
  provider: z.string(),
  model: z.string(),
});

const pythonJobParseSchema = z.object({
  title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  employment_type: z.string().nullable().optional(),
  seniority: z.string().nullable().optional(),
  required_qualifications: z.array(z.string()).default([]),
  preferred_qualifications: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  target_technologies: z.array(z.string()).default([]),
});

const pythonResearchSchema = z.object({
  findings: z.array(
    z.object({
      category: z.string(),
      title: z.string(),
      summary: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      status: z.enum(["supported", "uncertain", "unavailable"]).default("supported"),
      source_ids: z.array(z.string()).default([]),
    }),
  ),
  sources: z.array(z.record(z.string(), z.unknown())).default([]),
  overall_confidence: z.number(),
  company_research_status: z.string().nullable().optional(),
});

const pythonEvidenceMatchSchema = z.object({
  rows: z.array(
    z.object({
      requirement: z.string(),
      importance: z.enum(["required", "preferred", "responsibility"]).default("required"),
      evidence_ids: z.array(z.string()),
      evidence_strength: z.enum(["strong", "partial", "none"]),
      resume_usage: z.enum(["use", "consider", "skip"]).default("use"),
      coverage_gap: z.string().nullable().optional(),
    }),
  ),
  evidence_coverage: z.number(),
});

export type IntelligenceBackendMode = "typescript" | "python" | "shadow";

type RequestContext = {
  tenantId: string;
  userId: string;
  applicationId?: string;
  workflowRunId?: string;
  requestId: string;
};

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

function toSnakeEvidence(item: Record<string, unknown>) {
  return {
    id: item.id,
    tenant_id: item.tenantId ?? item.tenant_id,
    owner_user_id: item.ownerUserId ?? item.owner_user_id,
    title: item.title,
    organization: item.organization ?? null,
    situation: item.situation ?? null,
    task: item.task ?? null,
    actions: item.actions ?? [],
    result: item.result ?? null,
    metrics: item.metrics ?? [],
    technologies: item.technologies ?? [],
    source_type: item.sourceType ?? item.source_type ?? null,
    verification_status: item.verificationStatus ?? item.verification_status ?? "user_attested",
    candidate_confirmation_status:
      item.candidateConfirmationStatus ?? item.candidate_confirmation_status ?? "confirmed",
    confidence: item.confidence ?? "high",
    privacy_classification: item.privacyLevel ?? item.privacy_classification ?? "share-safe",
    claim_text: item.claimText ?? item.claim_text ?? null,
    employer_association: item.employerAssociation ?? item.employer_association ?? null,
    project_association: item.projectAssociation ?? item.project_association ?? null,
  };
}

function toSnakeResume(resume: Record<string, unknown>) {
  // Accept either already-snake PythonResume or camel TS resume shape.
  if ("version_number" in resume) return resume;
  const sections = Array.isArray(resume.sections) ? resume.sections : [];
  return {
    version_number: resume.versionNumber ?? resume.version_number ?? 0,
    score: resume.score ?? 0,
    score_breakdown: resume.scoreBreakdown ?? resume.score_breakdown ?? {},
    notes: resume.notes ?? "",
    sections: sections.map((section: Record<string, unknown>) => ({
      type: section.type,
      title: section.title,
      order: section.order ?? 0,
      content: section.content ?? null,
      bullets: Array.isArray(section.bullets)
        ? section.bullets.map((bullet: Record<string, unknown>) => ({
            text: bullet.text,
            evidence_ids: bullet.evidenceIds ?? bullet.evidence_ids ?? [],
            matched_requirements: bullet.matchedRequirements ?? bullet.matched_requirements ?? [],
            technologies: bullet.technologies ?? [],
            confidence: bullet.confidence ?? "high",
            claim_risk: bullet.claimRisk ?? bullet.claim_risk ?? "low",
            source_version: bullet.sourceVersion ?? bullet.source_version ?? "career-evidence",
          }))
        : null,
      items: Array.isArray(section.items)
        ? section.items.map((item: Record<string, unknown>) => ({
            heading: item.heading,
            subheading: item.subheading ?? null,
            location: item.location ?? null,
            dates: item.dates ?? null,
            bullets: Array.isArray(item.bullets)
              ? item.bullets.map((bullet: Record<string, unknown>) => ({
                  text: bullet.text,
                  evidence_ids: bullet.evidenceIds ?? bullet.evidence_ids ?? [],
                  matched_requirements: bullet.matchedRequirements ?? bullet.matched_requirements ?? [],
                  technologies: bullet.technologies ?? [],
                  confidence: bullet.confidence ?? "high",
                  claim_risk: bullet.claimRisk ?? bullet.claim_risk ?? "low",
                  source_version: bullet.sourceVersion ?? bullet.source_version ?? "career-evidence",
                }))
              : [],
          }))
        : null,
    })),
  };
}

/** Map Python resume JSON into the TypeScript resumeSchema shape used by PDF/DOCX. */
export function mapPythonResumeToTs(resume: PythonResume) {
  const breakdown = resume.score_breakdown ?? {};
  const score = resume.score;
  return {
    versionNumber: resume.version_number,
    score,
    scoreBreakdown: {
      atsCompatibility: Number(breakdown.atsCompatibility ?? score),
      jobAlignment: Number(breakdown.jobAlignment ?? score),
      recruiterReadability: Number(breakdown.recruiterReadability ?? score),
      impact: Number(breakdown.impact ?? score),
      quantification: Number(breakdown.quantification ?? score),
      technicalDepth: Number(breakdown.technicalDepth ?? score),
      competencyCoverage: Number(breakdown.competencyCoverage ?? score),
      evidenceConfidence: Number(breakdown.evidenceConfidence ?? score),
      writingQuality: Number(breakdown.writingQuality ?? score),
      formatIntegrity: Number(breakdown.formatIntegrity ?? score),
    },
    notes: resume.notes,
    sections: resume.sections.map((section) => ({
      type: section.type,
      title: section.title,
      order: section.order,
      content: section.content ?? undefined,
      bullets: section.bullets?.map((bullet) => ({
        text: bullet.text,
        evidenceIds: bullet.evidence_ids,
        matchedRequirements: bullet.matched_requirements,
        technologies: bullet.technologies,
        confidence: bullet.confidence,
        claimRisk: bullet.claim_risk,
        sourceVersion: bullet.source_version,
      })),
      items: section.items?.map((item) => ({
        heading: item.heading,
        subheading: item.subheading ?? undefined,
        location: item.location ?? undefined,
        dates: item.dates ?? undefined,
        bullets: item.bullets.map((bullet) => ({
          text: bullet.text,
          evidenceIds: bullet.evidence_ids,
          matchedRequirements: bullet.matched_requirements,
          technologies: bullet.technologies,
          confidence: bullet.confidence,
          claimRisk: bullet.claim_risk,
          sourceVersion: bullet.source_version,
        })),
      })),
    })),
  };
}

function mapSeverity(severity: "critical" | "major" | "minor" | "nit"): "critical" | "major" | "minor" | "suggestion" {
  return severity === "nit" ? "suggestion" : severity;
}

function mapQaStatus(status: "pass" | "warn" | "fail"): "pass" | "fail" | "warning" | "pending" {
  if (status === "warn") return "warning";
  return status;
}

/** Sanitized shadow comparison — counts only, no PII. */
export function compareResumeShapes(
  tsResume: { sections?: Array<Record<string, unknown>> },
  pyResume: { sections?: Array<Record<string, unknown>> },
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
  return {
    sectionCountDiff: Math.abs(tsSections.length - pySections.length),
    bulletCountDiff: Math.abs(countBullets(tsSections) - countBullets(pySections)),
    tsSectionCount: tsSections.length,
    pySectionCount: pySections.length,
    tsBulletCount: countBullets(tsSections),
    pyBulletCount: countBullets(pySections),
  };
}

export class PythonIntelligenceClient {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly baseUrl = getEnv().PYTHON_BACKEND_URL,
    private readonly token = getEnv().PYTHON_BACKEND_TOKEN,
    private readonly timeoutMs = 60_000,
  ) {}

  private circuitOpen() {
    if (this.failures < 5) return false;
    if (Date.now() - this.openedAt > 30_000) {
      this.failures = 0;
      return false;
    }
    return true;
  }

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
    return pythonJobParseSchema.parse(data);
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
    return pythonResearchSchema.parse(data);
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
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.evidenceMatch, {
      context: toSnakeContext(input.context),
      requirements: input.requirements,
      evidence: input.evidence.map((item) => toSnakeEvidence(item)),
      research_findings: [],
    });
    return pythonEvidenceMatchSchema.parse(data);
  }

  async generateResume(input: {
    context: RequestContext;
    versionNumber: number;
    jobDescription: string;
    evidence: Array<Record<string, unknown>>;
    allowedTechnologies: string[];
    idempotencyKey?: string;
  }) {
    const data = await this.post(
      PYTHON_BACKEND_PATHS.resumesGenerate,
      {
        context: toSnakeContext(input.context),
        version_number: input.versionNumber,
        job_description: input.jobDescription,
        evidence: input.evidence.map((item) => toSnakeEvidence(item)),
        allowed_technologies: input.allowedTechnologies,
      },
      input.idempotencyKey,
    );
    const resume = pythonResumeSchema.parse(data.resume);
    return {
      resume: mapPythonResumeToTs(resume),
      provider: String(data.provider ?? "python"),
      model: String(data.model ?? "unknown"),
      promptVersion: String(data.prompt_version ?? "python"),
      latencyMs: Number(data.latency_ms ?? 0),
    };
  }

  async regenerateResume(input: {
    context: RequestContext;
    versionNumber: number;
    jobDescription: string;
    evidence: Array<Record<string, unknown>>;
    allowedTechnologies: string[];
    idempotencyKey?: string;
  }) {
    const data = await this.post(
      PYTHON_BACKEND_PATHS.resumesRegenerate,
      {
        context: toSnakeContext(input.context),
        version_number: input.versionNumber,
        job_description: input.jobDescription,
        evidence: input.evidence.map((item) => toSnakeEvidence(item)),
        allowed_technologies: input.allowedTechnologies,
      },
      input.idempotencyKey,
    );
    const resume = pythonResumeSchema.parse(data.resume);
    return {
      resume: mapPythonResumeToTs(resume),
      provider: String(data.provider ?? "python"),
      model: String(data.model ?? "unknown"),
      promptVersion: String(data.prompt_version ?? "python"),
      latencyMs: Number(data.latency_ms ?? 0),
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
      },
      input.idempotencyKey,
    );
    const parsed = pythonAuditSchema.parse(data);
    return {
      data: {
        lens: parsed.lens,
        reviewsVersion: parsed.reviews_version,
        producesVersion: parsed.produces_version,
        scoreBefore: parsed.score_before,
        scoreAfter: parsed.score_after,
        summary: parsed.summary,
        findings: parsed.findings.map((finding) => ({
          severity: mapSeverity(finding.severity),
          section: finding.section,
          title: finding.title,
          explanation: finding.explanation,
          beforeText: finding.before_text,
          suggestedText: finding.suggested_text,
          expectedScoreImpact: finding.expected_score_impact,
          evidenceSource: finding.evidence_source ?? undefined,
        })),
      },
      provider: parsed.provider,
      model: parsed.model,
    };
  }

  async finalQa(input: {
    context: RequestContext;
    resume: Record<string, unknown>;
    evidence: Array<Record<string, unknown>>;
    deterministicChecks?: Array<Record<string, unknown>>;
  }) {
    const data = await this.post(PYTHON_BACKEND_PATHS.resumesFinalQa, {
      context: toSnakeContext(input.context),
      resume: toSnakeResume(input.resume),
      evidence: input.evidence.map((item) => toSnakeEvidence(item)),
      deterministic_checks: input.deterministicChecks ?? [],
    });
    const parsed = pythonFinalQaSchema.parse(data);
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
    };
  }

  private async post(path: string, body: unknown, idempotencyKey?: string): Promise<Record<string, unknown>> {
    if (this.circuitOpen()) {
      throw new Error("PYTHON_BACKEND_CIRCUIT_OPEN");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        authorization: `Bearer ${this.token}`,
      };
      if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        this.failures += 1;
        if (this.failures >= 5) this.openedAt = Date.now();
        const detail = json.detail as { code?: string; message?: string } | undefined;
        throw new Error(detail?.code ?? `PYTHON_BACKEND_${response.status}`);
      }
      this.failures = 0;
      return json;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= 5) this.openedAt = Date.now();
      logger.warn({ err: error, path }, "python intelligence request failed");
      throw error;
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

export function getResumeIntelligenceBackend(): IntelligenceBackendMode {
  return getEnv().RESUME_INTELLIGENCE_BACKEND;
}
