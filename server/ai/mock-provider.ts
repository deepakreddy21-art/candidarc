import { z } from "zod";
import { getPrompt, type PromptId } from "./prompt-registry";
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
  model: "mock-cisco-v1",
  temperature: 0,
  maxOutputTokens: 4096,
};

export const mockResearchSchema = z.object({
  findings: z.array(
    z.object({
      category: z.enum(["role", "company", "team", "project", "technology", "hiring-signal"]),
      title: z.string(),
      summary: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
      status: z.enum(["verified", "inferred", "unverified", "disputed"]),
      sourceIds: z.array(z.string()),
    }),
  ),
  overallConfidence: z.number().min(0).max(100),
});

export const mockEvidenceMatchSchema = z.object({
  rows: z.array(
    z.object({
      requirement: z.string(),
      importance: z.enum(["required", "preferred"]),
      evidenceIds: z.array(z.string()),
      evidenceStrength: z.enum(["high", "medium", "low"]),
      resumeUsage: z.enum(["used", "partial", "unused"]),
      coverageGap: z.string().optional(),
    }),
  ),
  evidenceCoverage: z.number().min(0).max(100),
});

export const mockResumeSchema = z.object({
  versionNumber: z.number().int().min(0).max(4),
  score: z.number().min(0).max(100),
  scoreBreakdown: z.object({
    atsCompatibility: z.number(),
    jobAlignment: z.number(),
    recruiterReadability: z.number(),
    impact: z.number(),
    quantification: z.number(),
    technicalDepth: z.number(),
    competencyCoverage: z.number(),
    evidenceConfidence: z.number(),
    writingQuality: z.number(),
    formatIntegrity: z.number(),
  }),
  notes: z.string(),
  sections: z.array(z.record(z.unknown())),
});

export const mockAuditSchema = z.object({
  lens: z.enum(["hr-1", "em-1", "hr-2", "em-2"]),
  reviewsVersion: z.number().int(),
  producesVersion: z.number().int(),
  scoreBefore: z.number(),
  scoreAfter: z.number(),
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(["critical", "major", "minor", "suggestion"]),
      section: z.string(),
      title: z.string(),
      explanation: z.string(),
      beforeText: z.string(),
      suggestedText: z.string(),
      expectedScoreImpact: z.number(),
      evidenceSource: z.string().optional(),
    }),
  ),
});

export const mockFinalQaSchema = z.object({
  passed: z.boolean(),
  checks: z.array(
    z.object({
      label: z.string(),
      status: z.enum(["pass", "fail", "warning", "pending"]),
      detail: z.string(),
    }),
  ),
});

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

function fixtureForPrompt(promptId: PromptId, user: string): unknown {
  const versionMatch = /versionNumber["']?\s*[:=]\s*(\d)/i.exec(user);
  const versionNumber = versionMatch ? Number(versionMatch[1]) : 0;

  switch (promptId) {
    case "job-extraction":
      return {
        title: "CX AI Software Engineer",
        company: "Cisco",
        requirements: [
          "Production Python and ML systems experience",
          "RAG / retrieval architecture",
          "Distributed inference and evaluation",
          "Kubernetes / cloud deployment familiarity",
        ],
        preferred: ["LangGraph or agent frameworks", "OpenSearch", "SageMaker"],
      };
    case "research-synthesis":
      return {
        findings: [
          {
            category: "role",
            title: "Own CX AI systems that improve customer outcomes",
            summary: "Role emphasizes production AI systems for CX, not pure research.",
            confidence: "high",
            status: "verified",
            sourceIds: ["src-jd"],
          },
          {
            category: "technology",
            title: "Stack leans toward Python, retrieval, and cloud ML ops",
            summary: "Python, PyTorch, retrieval systems, Kubernetes, and evaluation.",
            confidence: "high",
            status: "verified",
            sourceIds: ["src-jd", "src-tech"],
          },
          {
            category: "team",
            title: "Likely partnership with CX product and platform teams",
            summary: "Cross-functional delivery with product and platform partners.",
            confidence: "medium",
            status: "inferred",
            sourceIds: ["src-team"],
          },
        ],
        overallConfidence: 84,
      };
    case "evidence-matching":
      return {
        rows: [
          {
            requirement: "Production Python / ML systems",
            importance: "required",
            evidenceIds: ["ev-usaa", "ev-rag"],
            evidenceStrength: "high",
            resumeUsage: "used",
          },
          {
            requirement: "RAG / retrieval architecture",
            importance: "required",
            evidenceIds: ["ev-rag", "ev-eval"],
            evidenceStrength: "high",
            resumeUsage: "used",
          },
          {
            requirement: "Kubernetes / cloud deployment",
            importance: "required",
            evidenceIds: ["ev-usaa"],
            evidenceStrength: "medium",
            resumeUsage: "partial",
            coverageGap: "Avoid unsupported cluster-ownership claims",
          },
        ],
        evidenceCoverage: 86,
      };
    case "resume-generation": {
      const scored = SCORE_BY_VERSION[versionNumber] ?? SCORE_BY_VERSION[0];
      return {
        versionNumber,
        score: scored.score,
        scoreBreakdown: scored.breakdown,
        notes: scored.notes,
        sections: [
          {
            type: "summary",
            title: "Professional Summary",
            content:
              versionNumber === 0
                ? "Experienced AI engineer passionate about machine learning, cloud systems, and delivering impactful solutions for customers."
                : "AI software engineer with 5+ years shipping production inference, retrieval, and evaluation systems.",
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
    case "em-audit-1":
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
            evidenceSource: "ev-rag",
          },
        ],
      };
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
    case "em-audit-2":
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
            evidenceSource: "ev-eval",
          },
        ],
      };
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

  async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
  ): Promise<StructuredGenerationResult<T>> {
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
