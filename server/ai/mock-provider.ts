import { z } from "zod";
import { getPrompt, type PromptId } from "./prompt-registry";
import {
  auditSchema,
  evidenceMatchSchema,
  finalQaSchema,
  researchSchema,
  resumeSchema,
} from "./schemas";
import { validateEvidenceIds, validateResumeTechnologies } from "./evidence-guard";
import {
  AiProviderError,
  type GenerationProvider,
  type ModelConfig,
  type StreamingGenerationEvent,
  type StreamingGenerationRequest,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
  type UsageStats,
} from "./types";

const DEFAULT_MODEL: ModelConfig = {
  provider: "mock",
  model: "mock-generation-v1",
  temperature: 0,
  maxOutputTokens: 4096,
};

export const mockResearchSchema = researchSchema;
export const mockEvidenceMatchSchema = evidenceMatchSchema;
export const mockResumeSchema = resumeSchema;
export const mockAuditSchema = auditSchema;
export const mockFinalQaSchema = finalQaSchema;
export { mistakeMemorySchema as mockMistakeMemorySchema } from "./schemas";

const SCORE_BY_VERSION: Record<number, { score: number; breakdown: z.infer<typeof mockResumeSchema>["scoreBreakdown"]; notes: string }> = {
  0: {
    score: 68,
    notes: "Initial draft from research and evidence match",
    breakdown: {
      atsCompatibility: 70,
      jobAlignment: 65,
      recruiterReadability: 68,
      impact: 62,
      quantification: 60,
      technicalDepth: 70,
      competencyCoverage: 64,
      evidenceConfidence: 72,
      writingQuality: 70,
      formatIntegrity: 80,
    },
  },
  1: {
    score: 76,
    notes: "Regenerated from accepted HR Audit 1 findings",
    breakdown: {
      atsCompatibility: 82,
      jobAlignment: 78,
      recruiterReadability: 80,
      impact: 70,
      quantification: 68,
      technicalDepth: 70,
      competencyCoverage: 64,
      evidenceConfidence: 72,
      writingQuality: 70,
      formatIntegrity: 80,
    },
  },
  2: {
    score: 83,
    notes: "Regenerated from accepted EM Audit 1 findings",
    breakdown: {
      atsCompatibility: 86,
      jobAlignment: 84,
      recruiterReadability: 82,
      impact: 84,
      quantification: 82,
      technicalDepth: 88,
      competencyCoverage: 85,
      evidenceConfidence: 86,
      writingQuality: 70,
      formatIntegrity: 80,
    },
  },
  3: {
    score: 88,
    notes: "Regenerated from accepted HR Audit 2 findings",
    breakdown: {
      atsCompatibility: 91,
      jobAlignment: 89,
      recruiterReadability: 90,
      impact: 87,
      quantification: 86,
      technicalDepth: 89,
      competencyCoverage: 88,
      evidenceConfidence: 90,
      writingQuality: 88,
      formatIntegrity: 92,
    },
  },
  4: {
    score: 91,
    notes: "Final version from accepted EM Audit 2 findings + Final QA",
    breakdown: {
      atsCompatibility: 93,
      jobAlignment: 92,
      recruiterReadability: 91,
      impact: 90,
      quantification: 89,
      technicalDepth: 93,
      competencyCoverage: 91,
      evidenceConfidence: 92,
      writingQuality: 90,
      formatIntegrity: 94,
    },
  },
};

function usageFor(text: string): UsageStats {
  const tokens = Math.max(32, Math.ceil(text.length / 4));
  return { inputTokens: tokens, outputTokens: Math.ceil(tokens * 0.8), estimatedCostCents: 0 };
}

function detectPromptId(request: { prompt: { id: string }; system: string }): PromptId | null {
  const id = request.prompt.id;
  try {
    getPrompt(id);
    return id as PromptId;
  } catch {
    return null;
  }
}

function evidenceIdsFromContext(context: Record<string, unknown>): string[] {
  const fromEvidence = Array.isArray(context.evidence)
    ? (context.evidence as Array<Record<string, unknown>>)
        .map((item) => item.id)
        .filter((id): id is string => typeof id === "string")
    : [];
  if (fromEvidence.length) return fromEvidence;
  if (Array.isArray(context.allowedEvidenceIds)) {
    return (context.allowedEvidenceIds as unknown[]).filter((id): id is string => typeof id === "string");
  }
  return [];
}

function fixtureForPrompt(promptId: PromptId, user: string): unknown {
  const versionMatch = /versionNumber["']?\s*[:=]\s*(\d)/i.exec(user);
  const versionNumber = versionMatch ? Number(versionMatch[1]) : 0;
  let context: Record<string, unknown> = {};
  try {
    context = JSON.parse(user) as Record<string, unknown>;
  } catch {
    // Streaming callers may send plain text.
  }

  switch (promptId) {
    case "job-extraction":
      {
        let jobText = user;
        let contextCompany = "";
        let contextRole = "";
        try {
          const parsed = JSON.parse(user) as Record<string, unknown>;
          if (typeof parsed.jobText === "string") jobText = parsed.jobText;
          if (typeof parsed.company === "string") contextCompany = parsed.company;
          if (typeof parsed.role === "string") contextRole = parsed.role;
        } catch {
          // plain text fallback
        }
        const companyMatch =
          /\b(?:at|for)\s+([A-Z][A-Za-z0-9&.\- ]{1,40})\b/.exec(jobText) ||
          /^([A-Z][A-Za-z0-9&.\- ]{1,40})\s+seeks\b/i.exec(jobText) ||
          /\bCompany:\s*([^\n]+)/i.exec(jobText);
        const roleMatch =
          /(Senior|Staff|Principal|Lead)?\s*(Software|Platform|AI|ML|Data)?\s*Engineer/i.exec(jobText) ||
          /\bRole:\s*([^\n]+)/i.exec(jobText);
        const extractedCompany =
          contextCompany.trim() ||
          companyMatch?.[1]?.trim() ||
          "Unknown company";
        const extractedRole =
          contextRole.trim() ||
          roleMatch?.[0]?.trim() ||
          "Software Engineer";
        return {
          title: extractedRole,
          company: extractedCompany === "Unknown company" ? extractedCompany : extractedCompany,
          role: extractedRole,
          location: /Remote|Hybrid|On-site|Austin|TX/i.exec(jobText)?.[0] ?? "Remote",
          employmentType: "Full-time",
          seniority: /Senior|Staff|Principal|Lead/i.exec(jobText)?.[0] ?? "Mid-level",
          requiredQualifications: [
            "Production systems experience",
            "Cloud deployment familiarity",
          ],
          preferredQualifications: ["Observability", "On-call ownership"],
          responsibilities: [
            "Design and ship production features",
            "Partner with product on reliability",
          ],
          targetTechnologies: ["Kubernetes", "Go", "Terraform"].filter((tech) =>
            jobText.toLowerCase().includes(tech.toLowerCase()),
          ),
        };
      }
    case "research-synthesis":
      {
        const company = typeof context.company === "string" ? context.company : "Target company";
        const role = typeof context.role === "string" ? context.role : "target role";
        const collected = Array.isArray(context.collectedSources) ? context.collectedSources as Array<Record<string, unknown>> : [];
        const sources = collected.map((source, index) => ({
          id: typeof source.id === "string" ? source.id : `src-${index + 1}`,
          url: typeof source.url === "string" ? source.url : "https://example.com",
          title: typeof source.title === "string" ? source.title : "Provided job source",
          accessedAt: typeof source.accessedAt === "string" ? source.accessedAt : new Date().toISOString(),
          supportingText: typeof source.excerpt === "string" ? source.excerpt : "",
          confidence: source.confidence === "low" || source.confidence === "medium" ? source.confidence : "high",
          classification: "explicit" as const,
          relevance: `Provided source for ${role}`,
        }));
        const sourceIds = sources.map((source) => source.id);
      return {
        findings: [
          {
            category: "role",
            title: `${role} priorities at ${company}`,
            summary: typeof context.jobDescription === "string"
              ? context.jobDescription.slice(0, 300)
              : `Role requirements supplied for ${company}.`,
            confidence: "high",
            status: "verified",
            sourceIds,
          },
        ],
        sources,
        overallConfidence: 84,
      };
      }
    case "evidence-matching": {
      const evidenceIds = evidenceIdsFromContext(context);
      const primary = evidenceIds[0];
      const secondary = evidenceIds[1] ?? primary;
      return {
        rows: [
          {
            requirement: "Production Python / ML systems",
            importance: "required",
            evidenceIds: primary ? [primary] : [],
            evidenceStrength: primary ? "high" : "low",
            resumeUsage: primary ? "used" : "unused",
          },
          {
            requirement: "RAG / retrieval architecture",
            importance: "required",
            evidenceIds: primary && secondary ? [primary, secondary] : primary ? [primary] : [],
            evidenceStrength: primary ? "high" : "low",
            resumeUsage: primary ? "used" : "unused",
          },
          {
            requirement: "Kubernetes / cloud deployment",
            importance: "required",
            evidenceIds: secondary ? [secondary] : primary ? [primary] : [],
            evidenceStrength: primary ? "medium" : "low",
            resumeUsage: primary ? "partial" : "unused",
            coverageGap: primary ? "Avoid unsupported cluster-ownership claims" : "No owned evidence supplied",
          },
        ],
        evidenceCoverage: primary ? 86 : 0,
      };
    }
    case "resume-generation": {
      const scored = SCORE_BY_VERSION[versionNumber] ?? SCORE_BY_VERSION[0];
      const evidence = Array.isArray(context.evidence) ? context.evidence as Array<Record<string, unknown>> : [];
      const evidenceIds = evidenceIdsFromContext(context);
      const firstId = evidenceIds[0];
      const technologies = firstId && Array.isArray(evidence[0]?.technologies)
        ? (evidence[0].technologies as unknown[]).filter((value): value is string => typeof value === "string").slice(0, 3)
        : [];
      if (!firstId) {
        return {
          versionNumber,
          score: Math.min(scored.score, 55),
          scoreBreakdown: scored.breakdown,
          notes: "Awaiting owned career evidence before making evidenced claims.",
          sections: [
            {
              type: "summary",
              title: "Professional Summary",
              order: 0,
              content: "Profile pending verified career evidence.",
            },
          ],
        };
      }
      return {
        versionNumber,
        score: scored.score,
        scoreBreakdown: scored.breakdown,
        notes: scored.notes,
        sections: [
          {
            type: "summary",
            title: "Professional Summary",
            order: 0,
            bullets: [{
              text: versionNumber === 0
                ? "Engineer with experience grounded in the supplied career evidence."
                : "Engineer applying accepted audit feedback to evidence-backed delivery experience.",
              evidenceIds: [firstId],
              matchedRequirements: [],
              technologies,
              confidence: "high",
              claimRisk: "low",
              sourceVersion: versionNumber === 0 ? "career-evidence" : `V${versionNumber - 1}`,
            }],
          },
          {
            type: "experience",
            title: "Experience",
            order: 1,
            bullets: [{
              text: technologies.length
                ? `Delivered production outcomes using ${technologies.join(", ")} with measurable ownership.`
                : "Delivered production platform outcomes with measurable ownership.",
              evidenceIds: [firstId],
              matchedRequirements: [],
              technologies,
              confidence: "high",
              claimRisk: "low",
              sourceVersion: versionNumber === 0 ? "career-evidence" : `V${versionNumber - 1}`,
            }],
          },
          {
            type: "education",
            title: "Education",
            order: 2,
            bullets: [{
              text: "Bachelor's degree in Computer Science or equivalent applied education.",
              evidenceIds: [firstId],
              matchedRequirements: [],
              technologies: [],
              confidence: "medium",
              claimRisk: "low",
              sourceVersion: "career-evidence",
            }],
          },
        ],
      };
    }
    case "hr-audit-1":
      return {
        lens: "hr-1",
        reviewsVersion: 0,
        producesVersion: 1,
        scoreBefore: 68,
        scoreAfter: 76,
        summary: "Improved ATS keyword coverage, clarity, and career narrative.",
        findings: [
          {
            severity: "critical",
            section: "Summary",
            title: "Summary is generic and seniority-ambiguous",
            explanation: "Recruiters cannot map the candidate to CX AI ownership from the opening lines.",
            beforeText: "Experienced AI engineer passionate about machine learning...",
            suggestedText: "AI software engineer with 5+ years shipping production inference and retrieval systems...",
            expectedScoreImpact: 4,
          },
          {
            severity: "major",
            section: "Skills",
            title: "Missing ATS keywords from the posting",
            explanation: "Kubernetes, evaluation, and RAG language were underrepresented.",
            beforeText: "Python, ML, Cloud",
            suggestedText: "Python · PyTorch · RAG · Kubernetes · Evaluation pipelines",
            expectedScoreImpact: 3,
          },
        ],
      };
    case "em-audit-1": {
      const evidenceIds = evidenceIdsFromContext(context);
      return {
        lens: "em-1",
        reviewsVersion: 1,
        producesVersion: 2,
        scoreBefore: 76,
        scoreAfter: 83,
        summary: "Strengthened technical credibility, ownership, and scale.",
        findings: [
          {
            severity: "critical",
            section: "Experience",
            title: "Technical depth thin on RAG tradeoffs",
            explanation: "Engineering managers will challenge how latency and hallucination controls were achieved.",
            beforeText: "Improved RAG system performance and quality.",
            suggestedText:
              "Owned RAG performance work that reduced response time from 2.1s to 820ms while keeping hallucinations below 2%...",
            expectedScoreImpact: 5,
            evidenceSource: evidenceIds[0],
          },
        ],
      };
    }
    case "hr-audit-2":
      return {
        lens: "hr-2",
        reviewsVersion: 2,
        producesVersion: 3,
        scoreBefore: 83,
        scoreAfter: 88,
        summary: "Checked that technical densification did not harm readability.",
        findings: [
          {
            severity: "major",
            section: "Summary",
            title: "Summary exceeded three lines after technical rewrite",
            explanation: "HR scanability dropped when summary absorbed too many stack details.",
            beforeText: "Long multi-line technical summary...",
            suggestedText: "Keep summary under three lines; move stack specifics into Skills and Experience.",
            expectedScoreImpact: 2,
          },
        ],
      };
    case "em-audit-2": {
      const evidenceIds = evidenceIdsFromContext(context);
      return {
        lens: "em-2",
        reviewsVersion: 3,
        producesVersion: 4,
        scoreBefore: 88,
        scoreAfter: 91,
        summary: "Final technical polish and claim support before V4.",
        findings: [
          {
            severity: "major",
            section: "Experience",
            title: "Quantify evaluation ownership more explicitly",
            explanation: "Interviewers will probe the 500-question evaluation gate.",
            beforeText: "Improved evaluation coverage.",
            suggestedText:
              "Created a 500-question evaluation dataset and scoring harness used to gate RAG releases...",
            expectedScoreImpact: 3,
            evidenceSource: evidenceIds[0],
          },
        ],
      };
    }
    case "mistake-memory":
      return {
        rules: [
          {
            category: "writing",
            rule: "Do not use generic passion language in summary",
            severity: "major",
            originatingAudit: "hr-1",
            affectedVersion: "V0",
          },
        ],
      };
    case "final-qa":
      return {
        passed: true,
        checks: [
          { label: "Unresolved critical findings", status: "pass", detail: "None open" },
          { label: "Unsupported claims", status: "pass", detail: "All metrics grounded" },
          { label: "Contact information", status: "pass", detail: "Present and consistent" },
          { label: "Section completeness", status: "pass", detail: "Summary, skills, experience present" },
        ],
      };
    default:
      return {};
  }
}

export class MockGenerationProvider implements GenerationProvider {
  readonly name = "mock";
  static structuredCallCount = 0;

  static resetCallCounts() {
    MockGenerationProvider.structuredCallCount = 0;
  }

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
    MockGenerationProvider.structuredCallCount += 1;
    const started = Date.now();
    if (request.abortSignal?.aborted) {
      throw new AiProviderError("ABORTED", "Generation aborted", false);
    }

    const promptId = detectPromptId(request) ?? (request.prompt.id as PromptId);
    const fixture = fixtureForPrompt(promptId, request.user);
    const parsed = request.schema.safeParse(fixture);
    if (!parsed.success) {
      // Fall back: if caller schema differs, still try to return fixture when it's assignable via unknown
      const loose = request.schema.safeParse(fixture as T);
      if (!loose.success) {
        throw new AiProviderError("INVALID_MODEL_OUTPUT", "Mock fixture failed schema validation", true, loose.error.flatten());
      }
      if (promptId === "resume-generation") {
        validateEvidenceIds(loose.data, request.metadata?.allowedEvidenceIds);
        validateResumeTechnologies(loose.data, request.metadata?.allowedTechnologies);
      }
      const rawText = JSON.stringify(loose.data);
      return {
        data: loose.data,
        rawText,
        model: request.model ?? DEFAULT_MODEL,
        prompt: request.prompt,
        usage: usageFor(rawText),
        latencyMs: Date.now() - started,
      };
    }

    if (promptId === "resume-generation") {
      validateEvidenceIds(parsed.data, request.metadata?.allowedEvidenceIds);
      validateResumeTechnologies(parsed.data, request.metadata?.allowedTechnologies);
    }
    const rawText = JSON.stringify(parsed.data);
    return {
      data: parsed.data,
      rawText,
      model: request.model ?? DEFAULT_MODEL,
      prompt: request.prompt,
      usage: usageFor(rawText),
      latencyMs: Date.now() - started,
    };
  }

  async *streamText(request: StreamingGenerationRequest): AsyncIterable<StreamingGenerationEvent> {
    if (request.abortSignal?.aborted) {
      yield { type: "error", code: "ABORTED", message: "Generation aborted" };
      return;
    }
    const promptId = detectPromptId(request) ?? (request.prompt.id as PromptId);
    const fixture = fixtureForPrompt(promptId, request.user);
    const text = typeof fixture === "string" ? fixture : JSON.stringify(fixture, null, 2);
    const chunkSize = 48;
    for (let i = 0; i < text.length; i += chunkSize) {
      if (request.abortSignal?.aborted) {
        yield { type: "error", code: "ABORTED", message: "Generation aborted" };
        return;
      }
      yield { type: "delta", text: text.slice(i, i + chunkSize) };
    }
    yield {
      type: "done",
      usage: usageFor(text),
      model: request.model ?? DEFAULT_MODEL,
    };
  }
}
