/** Shared deterministic Python intelligence mock for Vitest (no live FastAPI). */
import { vi } from "vitest";
import { nowIso } from "../../../server/database/repositories";
import * as pythonClient from "../../../server/intelligence/python-client";

function sanitizeVisibleTech(text: string): string {
  return text
    .replace(
      /\b(AWS|Amazon Web Services|JAX|TPU|Google TPU|NVIDIA Triton|Triton|Trainium|AWS Trainium|vLLM|Ray|EKS|SageMaker)\b/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

function sanitizeTechList(techs: string[] | undefined): string[] {
  return (techs ?? ["Python"]).filter((t) => !/aws|jax|tpu|triton|trainium|vllm|^ray$/i.test(t));
}

export function resumeDocFixture(
  version: number,
  evidence: Array<{
    id?: string;
    organization?: string;
    title?: string;
    claimText?: string;
    result?: string;
    technologies?: string[];
    sourceType?: string;
  }> = [],
  job?: { company?: string; role?: string },
) {
  const employment = evidence.filter((e) => (e.sourceType ?? "employment") !== "education");
  const education = evidence.filter((e) => e.sourceType === "education");
  const primary = employment[0] ?? evidence[0];
  const evidenceId = primary?.id ?? "ev_test";
  const company = primary?.organization ?? "Acme";
  const role = primary?.title?.includes("at ")
    ? primary.title
    : "Software Engineer";
  const dates =
    primary?.claimText?.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}[^.]*/i)?.[0] ??
    "January 2024 – Present";
  const bulletText = sanitizeVisibleTech(
    primary?.result || primary?.claimText || "Built production systems with TypeScript and Python",
  );

  const edu = education[0];
  const jobCompany = job?.company ?? "Target Company";

  const doc = {
    versionNumber: version,
    absoluteVersion: version,
    cycleStep: version % 5,
    score: 70 + (version % 5),
    scoreBreakdown: {
      atsCompatibility: 70,
      jobAlignment: 70,
      recruiterReadability: 70,
      impact: 70,
      quantification: 70,
      technicalDepth: 70,
      competencyCoverage: 70,
      evidenceConfidence: 80,
      writingQuality: 70,
      formatIntegrity: 70,
    },
    notes: `mock python V${version} for ${jobCompany}`,
    sections: [
      {
        type: "experience" as const,
        title: "Experience",
        order: 0,
        items: employment.length
          ? employment.map((item) => ({
              heading: item.organization ?? company,
              subheading: "Software Engineer",
              dates:
                item.claimText?.match(
                  /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}[^.]*/i,
                )?.[0] ?? dates,
              bullets: [
                {
                  text: sanitizeVisibleTech(item.result || item.claimText || bulletText).slice(0, 390),
                  evidenceIds: [item.id ?? evidenceId],
                  technologies: sanitizeTechList(item.technologies),
                  matchedRequirements: [] as string[],
                  confidence: "high" as const,
                  claimRisk: "low" as const,
                  sourceVersion: "python",
                },
              ],
            }))
          : [
              {
                heading: company,
                subheading: role,
                dates,
                bullets: [
                  {
                    text: bulletText.slice(0, 390),
                    evidenceIds: [evidenceId],
                    technologies: sanitizeTechList(primary?.technologies ?? ["TypeScript", "Python"]),
                    matchedRequirements: [] as string[],
                    confidence: "high" as const,
                    claimRisk: "low" as const,
                    sourceVersion: "python",
                  },
                ],
              },
            ],
      },
      {
        type: "education" as const,
        title: "Education",
        order: 1,
        items: [
          {
            heading: edu?.organization ?? "Illinois Institute of Technology",
            subheading: edu?.title ?? "MS Information Technology and Management",
            dates: "January 2023 – May 2024",
            bullets: [
              {
                text: sanitizeVisibleTech(
                  edu?.claimText ?? "Completed graduate coursework in information technology",
                ),
                evidenceIds: [edu?.id ?? evidenceId],
                technologies: [] as string[],
                matchedRequirements: [] as string[],
                confidence: "high" as const,
                claimRisk: "low" as const,
                sourceVersion: "python",
              },
            ],
          },
        ],
      },
    ],
  };
  // Final QA walks every object value — ensure excluded tech tokens never remain.
  return JSON.parse(sanitizeVisibleTech(JSON.stringify(doc))) as typeof doc;
}

/**
 * Mock return shapes must match PythonIntelligenceClient method outputs
 * (post-parse / post-map), not raw FastAPI JSON.
 */
export function installMockPythonIntelligence(opts?: { evidenceId?: string }) {
  const evidenceId = opts?.evidenceId ?? "ev_test";
  const calls: string[] = [];
  let versionCounter = 0;

  const client = {
    parseJob: vi.fn(async (input?: { jobText?: string }) => {
      calls.push("parse");
      const text = String(input?.jobText ?? "");
      const company = text.includes("Asteria AI Systems")
        ? "Asteria AI Systems"
        : text.includes("Acme Robotics")
          ? "Acme Robotics"
          : "Acme";
      const role = text.includes("Senior AI Platform Engineer")
        ? "Senior AI Platform Engineer"
        : text.includes("Platform Engineer")
          ? "Platform Engineer"
          : "Engineer";
      return {
        company,
        role,
        title: role,
        location: "Remote",
        employment_type: "Full-time",
        required_qualifications: ["Python", "TypeScript"],
        preferred_qualifications: [] as string[],
        responsibilities: ["Build systems"],
        target_technologies: ["Python", "TypeScript", "PyTorch"],
      };
    }),
    synthesizeResearch: vi.fn(async () => {
      calls.push("research");
      // Match production-readiness expectations: no invented company facts.
      return {
        findings: [
          {
            category: "company",
            title: "Research unavailable",
            summary: "Company research unavailable for this application.",
            confidence: "low",
            status: "unavailable",
            source_ids: [] as string[],
          },
        ],
        sources: [] as unknown[],
        overall_confidence: 0.1,
        company_research_status: "unavailable",
        provider: "deterministic",
        model: "internal",
        latency_ms: 1,
        usage: {
          provider: "deterministic",
          model: "internal",
          prompt_version: "research@python-v1",
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: 1,
          estimated_cost_cents: 0,
          provider_request_id: null,
          retry_count: 0,
        },
      };
    }),
    matchEvidence: vi.fn(async (input: { evidence?: Array<{ id?: string }> }) => {
      calls.push("match");
      const id = input.evidence?.[0]?.id ?? evidenceId;
      return {
        evidence_coverage: 0.85,
        rows: [
          {
            requirement: "TypeScript",
            importance: "required",
            evidence_ids: [id],
            evidence_strength: "strong",
            resume_usage: "use",
            coverage_gap: null,
          },
        ],
        provider: "deterministic",
        model: "internal",
        latency_ms: 1,
        usage: {
          provider: "deterministic",
          model: "internal",
          prompt_version: "evidence-match@python-v1",
          input_tokens: 0,
          output_tokens: 0,
          latency_ms: 1,
          estimated_cost_cents: 0,
          provider_request_id: null,
          retry_count: 0,
        },
      };
    }),
    generateResume: vi.fn(async (input: {
      evidence?: Array<Record<string, unknown>>;
      jobDescription?: string;
    }) => {
      const v = versionCounter++;
      calls.push(`generate:${v}`);
      const companyMatch = String(input.jobDescription ?? "").match(/\b([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\b/);
      return {
        resume: resumeDocFixture(v, (input.evidence ?? []) as never, {
          company: companyMatch?.[1],
        }),
        absoluteVersion: v,
        cycleStep: v % 5,
        provider: "mock",
        model: "mock",
        promptVersion: "test",
        latencyMs: 5,
        usage: { inputTokens: 10, outputTokens: 10, estimatedCostCents: 1, costUnknown: false },
      };
    }),
    regenerateResume: vi.fn(async (input: {
      absoluteVersion?: number;
      evidence?: Array<Record<string, unknown>>;
      jobDescription?: string;
    }) => {
      const v = input.absoluteVersion ?? versionCounter++;
      versionCounter = Math.max(versionCounter, v + 1);
      calls.push(`regenerate:${v}`);
      const companyMatch = String(input.jobDescription ?? "").match(/Asteria AI Systems/)
        ? "Asteria AI Systems"
        : undefined;
      return {
        resume: resumeDocFixture(v, (input.evidence ?? []) as never, {
          company: companyMatch ?? "Asteria AI Systems",
        }),
        absoluteVersion: v,
        cycleStep: v % 5,
        provider: "mock",
        model: "mock",
        promptVersion: "test",
        latencyMs: 5,
        usage: { inputTokens: 10, outputTokens: 10, estimatedCostCents: 1, costUnknown: false },
      };
    }),
    auditResume: vi.fn(async (input: { lens: string; reviewsVersion: number; producesVersion: number }) => {
      calls.push(`audit:${input.lens}`);
      return {
        data: {
          lens: input.lens,
          reviewsVersion: input.reviewsVersion,
          producesVersion: input.producesVersion,
          scoreBefore: 70,
          scoreAfter: 71,
          summary: `audit ${input.lens}`,
          findings: [] as unknown[],
          rejectedFindings: [] as unknown[],
        },
        provider: "mock",
        model: "mock",
        promptVersion: "test",
        latencyMs: 4,
        usage: { inputTokens: 5, outputTokens: 5, estimatedCostCents: 1, costUnknown: false },
      };
    }),
    finalQa: vi.fn(async () => {
      calls.push("final-qa");
      const requiredPass = (code: string, label: string) => ({
        code,
        label,
        status: "pass" as const,
        blocking: true,
        detail: "ok",
      });
      return {
        data: {
          passed: true,
          checks: [
            requiredPass("PRIMARY_TECHNOLOGY_EMPHASIS", "Primary technology emphasis"),
            requiredPass("HAS_SUMMARY", "Has summary"),
            requiredPass("HAS_EXPERIENCE", "Has experience"),
            requiredPass("DUPLICATE_BULLETS", "Duplicate bullets"),
            requiredPass("REQUIRED_SECTIONS", "Required sections"),
            requiredPass("EVIDENCE_LINKED", "Evidence linked"),
            requiredPass("TECHNOLOGY_CLAIMS", "Technology claims"),
            requiredPass("SCORE_RUBRIC_PRESENT", "Score rubric present"),
            requiredPass("CRITICAL_FINDINGS", "Critical findings"),
            requiredPass("EVIDENCE_REFERENCES", "Evidence references"),
          ],
          notes: "passed",
        },
        provider: "mock",
        model: "mock",
        promptVersion: "test",
        latencyMs: 3,
        usage: { inputTokens: 1, outputTokens: 1, estimatedCostCents: null, costUnknown: true },
      };
    }),
  };

  const spy = vi.spyOn(pythonClient, "getPythonIntelligenceClient").mockReturnValue(client as never);
  vi.spyOn(pythonClient, "resolveIntelligenceBackendForTenant").mockReturnValue("python");
  return { client, calls, spy };
}
