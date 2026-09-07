import { createHash } from "crypto";
import {
  auditSchema,
  evidenceMatchSchema,
  finalQaSchema,
  researchSchema,
  resumeSchema,
} from "../ai/schemas";
import type { StructuredGenerationResult } from "../ai/types";
import { collectResearchSources } from "../ai/research-collector";
import { addMistakeMemoryRule, listActiveMistakeMemory } from "../ai/mistake-memory";
import { adjudicateFindings, buildAdjudicationContext } from "../resumes/audit-adjudication";
import type {
  ApplicationRepository,
  AuditRepository,
  EvidenceRepository,
  ResearchRepository,
  Repositories,
  ResumeRepository,
  UsageRepository,
  WorkflowRepository,
  WorkflowRunRecord,
} from "../database/repositories";
import { newId, nowIso } from "../database/repositories";
import { AppError, AUDIT_SEQUENCE, type WorkflowStage } from "../domain/types";
import { logger } from "../observability/logger";
import { assertAuditOrder, stageMatchesJobClaim } from "./stages";

/** Drop active stage claim leases so a stage can be re-entered (e.g. Final QA after repair). */
function withoutStageClaims(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (key.startsWith("claimed:")) delete next[key];
  }
  return next;
}
import type { DurableWorkflowEngine } from "./engine";
import { runDeterministicFinalQa } from "./final-qa";
import type { QueueAdapter } from "./queues";
import { claimableTechnologies, extractTechQuestions, hasUnansweredTechQuestions, type TechQuestion } from "../resumes/tech-questions";
import { computeCandidArcQualityScore } from "../resumes/quality-score";
import {
  applyJobExtractionToApplication,
  fetchJobDescriptionFromUrl,
  isPlaceholderIdentity,
  PLACEHOLDER_COMPANY,
  PLACEHOLDER_ROLE,
} from "../resumes/job-extraction";
import type { z } from "zod";

function hashFinalQaChecks(checks: Array<{ label?: string; status?: string; detail?: string }>): string {
  const normalized = checks
    .map((check) => `${check.label ?? ""}|${check.status ?? ""}|${check.detail ?? ""}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

type ResumeGenerationResult = StructuredGenerationResult<z.infer<typeof resumeSchema>>;
type AuditGenerationResult = StructuredGenerationResult<z.infer<typeof auditSchema>>;
type FinalQaSupplementResult = StructuredGenerationResult<z.infer<typeof finalQaSchema>>;

export type ResumePipelineDeps = {
  engine: DurableWorkflowEngine;
  workflows: WorkflowRepository;
  applications: ApplicationRepository;
  research: ResearchRepository;
  resumes: ResumeRepository;
  audits: AuditRepository;
  usage: UsageRepository;
  evidence: EvidenceRepository;
  store: Repositories["store"];
  queue?: QueueAdapter;
};

export function filterFindingsForNextGeneration<T extends { status: string }>(findings: T[]): T[] {
  return findings.filter((finding) => finding.status === "accepted" || finding.status === "edited");
}

function withResumeProvenance(
  sections: Array<Record<string, unknown>>,
  versionNumber: number,
): Array<Record<string, unknown>> {
  return sections.map((section, sectionIndex) => {
    const addBullet = (value: unknown, bulletIndex: number) => {
      const bullet = value as Record<string, unknown>;
      return {
        id: typeof bullet.id === "string" ? bullet.id : newId(`rb${versionNumber}${sectionIndex}${bulletIndex}`),
        ...bullet,
        unsupported: bullet.claimRisk === "high",
        researchRequirementIds: bullet.matchedRequirements,
      };
    };
    const items = Array.isArray(section.items)
      ? section.items.map((value, itemIndex) => {
          const item = value as Record<string, unknown>;
          return {
            id: typeof item.id === "string" ? item.id : newId(`ri${versionNumber}${sectionIndex}${itemIndex}`),
            ...item,
            bullets: Array.isArray(item.bullets) ? item.bullets.map(addBullet) : [],
          };
        })
      : undefined;
    const bullets = Array.isArray(section.bullets) ? section.bullets.map(addBullet) : undefined;
    return {
      id: typeof section.id === "string" ? section.id : newId(`rs${versionNumber}${sectionIndex}`),
      order: typeof section.order === "number" ? section.order : sectionIndex,
      ...section,
      ...(bullets ? { bullets } : {}),
      ...(items ? { items } : {}),
    };
  });
}

/**
 * Application service orchestrating the vertical slice handlers.
 * Each handler is invoked by workers after queue delivery — not from HTTP.
 */
export class ResumePipeline {
  constructor(private readonly deps: ResumePipelineDeps) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine, queue?: QueueAdapter) {
    return new ResumePipeline({
      engine,
      workflows: repos.workflows,
      applications: repos.applications,
      research: repos.research,
      resumes: repos.resumes,
      audits: repos.audits,
      usage: repos.usage,
      evidence: repos.evidence,
      store: repos.store,
      queue,
    });
  }

  private async listScopedEvidence(run: WorkflowRunRecord) {
    const application = await this.deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
    if (!application?.ownerUserId) {
      throw new AppError("OWNER_REQUIRED", "Application owner is required for evidence-scoped workflow", 422);
    }
    const evidence = await this.deps.evidence.list(run.tenantId, {
      ownerUserId: application.ownerUserId,
      applicationPublicId: run.applicationPublicId,
    });
    return { application, evidence };
  }

  async handleStage(run: WorkflowRunRecord, claimedStage?: WorkflowStage): Promise<void> {
    const expectedStage = claimedStage ?? run.stage;
    const latest = (await this.deps.workflows.getById(run.id)) ?? run;
    if (latest.status === "cancelled" || latest.status === "failed") return;
    if (!stageMatchesJobClaim(latest.stage, expectedStage)) {
      logger.info(
        { workflowId: latest.publicId, expected: expectedStage, actual: latest.stage },
        "skipping stale queue job",
      );
      return;
    }

    const claimed = await this.deps.workflows.claimStage(run.id, expectedStage);
    if (!claimed) {
      logger.info({ workflowId: latest.publicId, expected: expectedStage }, "stage already claimed");
      return;
    }

    switch (claimed.stage) {
      case "RESEARCH_QUEUED":
      case "RESEARCH_RUNNING":
        await this.runResearch(claimed);
        break;
      case "EVIDENCE_MATCHING_RUNNING":
        await this.runEvidenceMatching(claimed);
        break;
      case "V0_GENERATING":
        await this.runResumeGeneration(claimed, 0, "Initial generation");
        break;
      case "HR_AUDIT_1_RUNNING":
        await this.runAudit(claimed, "hr-audit-1", 0, 1);
        break;
      case "V1_GENERATING":
        await this.runResumeGeneration(claimed, 1, "HR Audit 1");
        break;
      case "EM_AUDIT_1_RUNNING":
        await this.runAudit(claimed, "em-audit-1", 1, 2);
        break;
      case "V2_GENERATING":
        await this.runResumeGeneration(claimed, 2, "EM Audit 1");
        break;
      case "HR_AUDIT_2_RUNNING":
        await this.runAudit(claimed, "hr-audit-2", 2, 3);
        break;
      case "V3_GENERATING":
        await this.runResumeGeneration(claimed, 3, "HR Audit 2");
        break;
      case "EM_AUDIT_2_RUNNING":
        await this.runAudit(claimed, "em-audit-2", 3, 4);
        break;
      case "V4_GENERATING":
        assertAuditOrder({ stage: "V4_GENERATING", reviewsVersion: 3, producesVersion: 4 });
        await this.runResumeGeneration(claimed, 4, "EM Audit 2");
        break;
      case "FINAL_QA_RUNNING":
        await this.runFinalQa(claimed);
        break;
      default:
        logger.debug({ stage: claimed.stage }, "pipeline no-op stage");
    }
  }

  private async reserve(run: WorkflowRunRecord, kind: string, units: number, operationId: string) {
    // Distinct paid operations must not collide: include a stable operation identity.
    // Retries of the same operationId remain idempotent via the usage ledger unique key.
    const key = `${run.tenantId}:usage:${run.idempotencyKey}:${operationId}:${kind}`;
    await this.deps.usage.append({
      tenantId: run.tenantId,
      kind,
      units: String(units),
      costCents: "0",
      workflowRunId: run.id,
      idempotencyKey: key,
      status: "reserved",
      metadata: { stage: run.stage, operationId },
    });
    return key;
  }

  /** Customer-facing flows treat tech confirmation as optional and never pause the pipeline. */
  private shouldPauseForTechConfirmation(run: WorkflowRunRecord, questions: TechQuestion[]): boolean {
    if (run.payload?.customerFacing === true) return false;
    return hasUnansweredTechQuestions(questions);
  }

  /**
   * Atomically commit a usage reservation and create a cost observation row.
   * Uses the transactional commitReservedWithCost method to ensure atomicity.
   *
   * This prevents leaving a committed reservation without a cost observation row,
   * even if the process crashes mid-commit (Postgres rolls back the transaction).
   */
  private async commit(key: string, costCents: string | null, opts?: { tenantId?: string; billable?: boolean }) {
    const tenantId = opts?.tenantId;
    if (!tenantId) {
      // Legacy callers must pass tenant — look up is unsafe without it.
      throw new AppError("USAGE_TENANT_REQUIRED", "tenantId required to commit usage", 500);
    }

    // Look up the entry to get userId and workflowRunId for the cost row
    const entry = await this.deps.usage.findByIdempotency(tenantId, key);
    if (!entry) return;
    if (entry.tenantId !== tenantId) {
      throw new AppError("USAGE_FORBIDDEN", "Cannot commit another tenant's usage", 403);
    }

    const billable = opts?.billable !== false;

    // Use transactional commit to ensure reservation and cost row are written atomically
    await this.deps.usage.commitReservedWithCost({
      tenantId,
      idempotencyKey: key,
      costCents: costCents == null ? null : costCents,
      userId: entry.userId ?? "",
      workflowRunId: entry.workflowRunId,
      metadata: costCents == null ? { billable: false } : { billable },
    });
  }

  private async recordProviderUsage(
    run: WorkflowRunRecord,
    key: string,
    result: {
      model: { provider: string; model: string };
      prompt: { version: string };
      usage: {
        inputTokens: number;
        outputTokens: number;
        estimatedCostCents: number | null;
        costUnknown?: boolean;
        pricingVersion?: string;
      };
      latencyMs: number;
    },
    opts?: { billable?: boolean; shadow?: boolean },
  ) {
    const costUnknown = result.usage.estimatedCostCents == null || result.usage.costUnknown === true;
    const billable = opts?.billable !== false && opts?.shadow !== true;
    if (costUnknown) {
      logger.warn(
        {
          applicationPublicId: run.applicationPublicId,
          stage: run.stage,
          provider: result.model.provider,
          model: result.model.model,
          metric: "PROVIDER_COST_UNKNOWN",
        },
        "PROVIDER_COST_UNKNOWN",
      );
    }
    // Token row carries units only — monetary amount lives solely on provider_cost.
    await this.deps.usage.append({
      tenantId: run.tenantId,
      kind: "input_tokens",
      units: String(result.usage.inputTokens + result.usage.outputTokens),
      costCents: "0",
      workflowRunId: run.id,
      idempotencyKey: `${key}:provider-usage`,
      status: "committed",
      metadata: {
        provider: result.model.provider,
        model: result.model.model,
        promptVersion: result.prompt.version,
        pricingVersion: result.usage.pricingVersion,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
        estimatedCostCents: result.usage.estimatedCostCents,
        costUnknown,
        costStatus: costUnknown ? "unknown" : "known",
        billable: billable && !costUnknown,
        shadow: opts?.shadow === true,
      },
    });
    logger.info(
      {
        applicationPublicId: run.applicationPublicId,
        stage: run.stage,
        provider: result.model.provider,
        model: result.model.model,
        latencyMs: result.latencyMs,
        tokens: result.usage.inputTokens + result.usage.outputTokens,
        costUnknown,
        billable: billable && !costUnknown,
      },
      "pipeline AI stage completed",
    );
  }

  private commitCostCents(estimatedCostCents: number | null): string | null {
    return estimatedCostCents == null ? null : String(estimatedCostCents);
  }

  /**
   * Persist execution backend metadata on workflow start or first intelligence stage.
   * This ensures the backend cannot change mid-run.
   */
  private async ensureExecutionBackendPersisted(run: WorkflowRunRecord) {
    if (run.payload?.executionBackend) return; // Already persisted
    await this.deps.workflows.updateRun(run.id, {
      payload: {
        ...run.payload,
        executionBackend: "python",
        intelligenceContractVersion: "2026-09-resume-intelligence.v1",
      },
    });
  }

  private async recordStageBackend(
    run: WorkflowRunRecord,
    operation: "parse" | "research" | "match" | "generate" | "regenerate" | "audit" | "final-qa",
    executionBackend: "python",
  ) {
    await this.deps.workflows.appendEvent({
      workflowRunId: run.id,
      workflowRunPublicId: run.publicId,
      tenantId: run.tenantId,
      applicationId: run.applicationId,
      applicationPublicId: run.applicationPublicId,
      stage: run.stage,
      status: run.status,
      message: `intelligence:${operation}:${executionBackend}`,
      metadata: { executionBackend, operation },
    });
  }

  private async runResearch(run: WorkflowRunRecord) {
    if (run.stage === "RESEARCH_QUEUED") {
      await this.deps.engine.transition(run.id, "RESEARCH_RUNNING", { message: "Research started" });
      run = (await this.deps.engine.getStatus(run.tenantId, run.publicId))!;
    }

    let application = await this.deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
    if (!application) throw new AppError("APPLICATION_NOT_FOUND", "Application required for research", 404);

    if (!application.metadata?.jobExtractionAppliedAt) {
      let jobDescription = typeof application.metadata?.jobDescription === "string"
        ? application.metadata.jobDescription
        : "";
      const jobUrl = typeof application.metadata?.jobUrl === "string" ? application.metadata.jobUrl : undefined;
      if (!jobDescription.trim() && jobUrl) {
        try {
          jobDescription = await fetchJobDescriptionFromUrl(jobUrl);
        } catch (error) {
          logger.warn({ jobUrl, error }, "job URL fetch failed during extraction");
        }
      }
      if (jobDescription.trim()) {
        // Python is the only backend — always use Python for job parsing
        const { getPythonIntelligenceClient, mapPythonJobParseToExtraction, mapPythonBackendErrorToAppError } =
          await import("../intelligence/python-client");
        let extraction;
        try {
          await this.recordStageBackend(run, "parse", "python");
          const parsed = await getPythonIntelligenceClient().parseJob({
            context: {
              tenantId: run.tenantId,
              userId: application.ownerUserId ?? "unknown",
              applicationId: run.applicationPublicId,
              workflowRunId: run.publicId,
              requestId: run.id,
            },
            jobText: jobDescription,
            company: application.company !== PLACEHOLDER_COMPANY ? application.company : undefined,
            role: application.role !== PLACEHOLDER_ROLE ? application.role : undefined,
          });
          extraction = mapPythonJobParseToExtraction(parsed);
        } catch (error) {
          throw mapPythonBackendErrorToAppError(error);
        }
        const applied = applyJobExtractionToApplication(application, extraction);
        application = await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
          company: applied.company,
          companyMark: applied.company.slice(0, 2).toUpperCase(),
          role: applied.role,
          location: applied.location,
          employmentType: applied.employmentType,
          metadata: {
            ...applied.metadata,
            jobDescription: jobDescription || application.metadata?.jobDescription,
          },
          ...(applied.needsIdentityReview
            ? {
                stage: "RESEARCH_REVIEW_REQUIRED",
                workflowStage: "RESEARCH_REVIEW_REQUIRED",
                status: "researching",
                nextAction: "Confirm company and role",
              }
            : {}),
        });
        if (applied.needsIdentityReview) {
          await this.deps.engine.transition(run.id, "RESEARCH_REVIEW_REQUIRED", {
            status: "waiting_review",
            message: "Company and role confirmation required before research continues",
          });
          return;
        }
      } else if (isPlaceholderIdentity(application.company, application.role)) {
        application = await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
          stage: "RESEARCH_REVIEW_REQUIRED",
          workflowStage: "RESEARCH_REVIEW_REQUIRED",
          status: "researching",
          nextAction: "Confirm company and role",
        });
        await this.deps.engine.transition(run.id, "RESEARCH_REVIEW_REQUIRED", {
          status: "waiting_review",
          message: "Company and role confirmation required before research continues",
        });
        return;
      }
    }

    if (application.workflowStage === "RESEARCH_REVIEW_REQUIRED") {
      return;
    }

    const usageKey = await this.reserve(run, "research", 1, "research:synthesize");
    await this.ensureExecutionBackendPersisted(run);
    const jobDescription = typeof application.metadata?.jobDescription === "string"
      ? application.metadata.jobDescription
      : "";
    const jobUrl = typeof application.metadata?.jobUrl === "string" ? application.metadata.jobUrl : undefined;
    const researchDepth = typeof application.metadata?.researchDepth === "string"
      ? application.metadata.researchDepth
      : "standard";
    // Public source collection stays in TypeScript — Python never fetches arbitrary URLs.
    const collectedSources = await collectResearchSources({
      company: application.company,
      role: application.role,
      jobUrl,
      jobDescription,
      researchDepth,
    });

    let result: {
      data: z.infer<typeof researchSchema>;
      model: { provider: string; model: string };
      prompt: { version: string };
      usage: { inputTokens: number; outputTokens: number; estimatedCostCents: number | null; costUnknown?: boolean };
      latencyMs: number;
    };
    let promptVersion = "research-synthesis";

    // Python is the only backend — no TypeScript fallback
    const {
      getPythonIntelligenceClient,
      mapPythonResearchToTs,
      mapPythonBackendErrorToAppError,
      mapProviderUsage,
    } = await import("../intelligence/python-client");
    try {
      await this.recordStageBackend(run, "research", "python");
      const started = Date.now();
      const py = await getPythonIntelligenceClient().synthesizeResearch({
        context: {
          tenantId: run.tenantId,
          userId: application.ownerUserId ?? "unknown",
          applicationId: run.applicationPublicId,
          workflowRunId: run.publicId,
          requestId: run.id,
        },
        company: application.company,
        role: application.role,
        jobDescription,
        sources: collectedSources.map((source) => ({
          id: source.id,
          url: source.url,
          title: source.title,
          accessed_at: source.accessedAt,
          supporting_text: source.excerpt,
          confidence: source.confidence,
          classification: "explicit",
        })),
      });
      const mapped = mapPythonResearchToTs(py);
      const usage = mapProviderUsage({
        provider: "python",
        model: "research-synthesize",
        prompt_version: "research@python-v1",
        latency_ms: Date.now() - started,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_cents: null,
      });
      result = {
        data: mapped,
        model: { provider: "python", model: "research-synthesize" },
        prompt: { version: "research@python-v1" },
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostCents: usage.estimatedCostCents,
          costUnknown: usage.costUnknown,
        },
        latencyMs: Date.now() - started,
      };
      promptVersion = "research@python-v1";
    } catch (error) {
      throw mapPythonBackendErrorToAppError(error);
    }
    const candidateEvidence = (await this.listScopedEvidence(run)).evidence;
    const techQuestions = extractTechQuestions({
      jobDescription,
      researchFindings: result.data.findings,
      candidateTechnologies: candidateEvidence.flatMap((item) => item.technologies),
    });
    const jobRequirements = Array.isArray(application.metadata?.jobRequirements)
      ? (application.metadata.jobRequirements as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      metadata: {
        ...application.metadata,
        techQuestions,
        jobRequirements,
        researchFindings: result.data.findings,
        researchSourceCount: result.data.sources.length,
        excludedTechnologies: [],
      },
    });
    const collectedByUrl = new Map(collectedSources.map((source) => [source.url, source]));
    result.data.sources = result.data.sources
      .filter((source) => collectedByUrl.has(source.url))
      .map((source) => ({ ...source, accessedAt: collectedByUrl.get(source.url)!.accessedAt }));
    if (!result.data.sources.length && collectedSources.length) {
      result.data.sources = collectedSources.map((source) => ({
        id: source.id,
        url: source.url,
        title: source.title,
        accessedAt: source.accessedAt,
        supportingText: source.excerpt,
        confidence: source.confidence,
        classification: "explicit" as const,
        relevance: "Permitted public source collected for this job application",
      }));
    }
    await this.recordProviderUsage(run, usageKey, result);

    const existing = await this.deps.research.getLatest(run.tenantId, run.applicationPublicId);
    if (existing && existing.status === "completed") {
      await this.commit(usageKey, this.commitCostCents(result.usage.estimatedCostCents), { tenantId: run.tenantId });
      const pauseForTech = this.shouldPauseForTechConfirmation(run, techQuestions);
      await this.deps.engine.transition(run.id, "RESEARCH_COMPLETED", {
        status: pauseForTech ? "waiting_review" : undefined,
        message: pauseForTech
          ? "Waiting for technology confirmation before evidence matching"
          : "Research already completed (idempotent)",
      });
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: "RESEARCH_COMPLETED",
        workflowStage: "RESEARCH_COMPLETED",
        researchConfidence: result.data.overallConfidence,
        status: "evidence",
        nextAction: pauseForTech ? "Confirm technologies" : "Match evidence",
      });
      if (pauseForTech) {
        return;
      }
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: "EVIDENCE_MATCHING_RUNNING",
        workflowStage: "EVIDENCE_MATCHING_RUNNING",
        nextAction: "Match evidence",
      });
      await this.deps.engine.transition(run.id, "EVIDENCE_MATCHING_RUNNING", {
        message: "Evidence matching started automatically",
      });
      return;
    }

    const researchPublicId = existing?.publicId ?? newId("rr");
    if (!existing) {
      await this.deps.research.createRun({
        id: newId("rid"),
        publicId: researchPublicId,
        tenantId: run.tenantId,
        applicationId: run.applicationId,
        applicationPublicId: run.applicationPublicId,
        status: "completed",
        depth: "standard",
        confidence: result.data.overallConfidence,
        findings: result.data.findings,
        sources: result.data.sources,
        completedAt: nowIso(),
      });
    } else {
      await this.deps.research.updateRun(run.tenantId, existing.publicId, {
        status: "completed",
        confidence: result.data.overallConfidence,
        findings: result.data.findings,
        sources: result.data.sources,
        completedAt: nowIso(),
      });
    }

    await this.commit(usageKey, this.commitCostCents(result.usage.estimatedCostCents), { tenantId: run.tenantId });
    const waitingForTech = this.shouldPauseForTechConfirmation(run, techQuestions);
    await this.deps.engine.transition(run.id, "RESEARCH_COMPLETED", {
      status: waitingForTech ? "waiting_review" : undefined,
      message: waitingForTech
        ? "Waiting for technology confirmation before evidence matching"
        : "Research completed",
      patch: {
        provider: result.model.provider,
        model: result.model.model,
        promptVersion,
        tokenUsage: {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
          total: result.usage.inputTokens + result.usage.outputTokens,
        },
        estimatedCostCents:
          result.usage.estimatedCostCents == null
            ? undefined
            : String(result.usage.estimatedCostCents),
      },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "RESEARCH_COMPLETED",
      workflowStage: "RESEARCH_COMPLETED",
      researchConfidence: result.data.overallConfidence,
      status: "evidence",
      nextAction: waitingForTech ? "Confirm technologies" : "Match evidence",
    });

    if (waitingForTech) {
      return;
    }

    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "EVIDENCE_MATCHING_RUNNING",
      workflowStage: "EVIDENCE_MATCHING_RUNNING",
      nextAction: "Match evidence",
    });
    await this.deps.engine.transition(run.id, "EVIDENCE_MATCHING_RUNNING", {
      message: "Evidence matching started automatically",
    });
  }

  private async runEvidenceMatching(run: WorkflowRunRecord) {
    const usageKey = await this.reserve(run, "research", 1, "match:evidence");
    await this.ensureExecutionBackendPersisted(run);
    const application = await this.deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
    const research = await this.deps.research.getLatest(run.tenantId, run.applicationPublicId);
    const { evidence } = await this.listScopedEvidence(run);
    const requirements = Array.isArray(application?.metadata?.jobRequirements)
      ? (application!.metadata!.jobRequirements as unknown[]).filter((item): item is string => typeof item === "string")
      : typeof application?.metadata?.jobDescription === "string"
        ? [String(application.metadata.jobDescription).slice(0, 2000)]
        : [];

    let result: {
      data: z.infer<typeof evidenceMatchSchema>;
      model: { provider: string; model: string };
      prompt: { version: string };
      usage: { inputTokens: number; outputTokens: number; estimatedCostCents: number | null; costUnknown?: boolean };
      latencyMs: number;
    };
    let promptVersion = "evidence-matching";

    // Python is the only backend — no TypeScript fallback
    const {
      getPythonIntelligenceClient,
      mapPythonEvidenceMatchToTs,
      mapPythonBackendErrorToAppError,
      mapProviderUsage,
    } = await import("../intelligence/python-client");
    try {
      await this.recordStageBackend(run, "match", "python");
      const started = Date.now();
      const py = await getPythonIntelligenceClient().matchEvidence({
        context: {
          tenantId: run.tenantId,
          userId: application?.ownerUserId ?? "unknown",
          applicationId: run.applicationPublicId,
          workflowRunId: run.publicId,
          requestId: run.id,
        },
        requirements: requirements.length ? requirements : ["general platform engineering"],
        evidence: evidence.map((item) => ({
          id: item.publicId,
          tenantId: item.tenantId,
          ownerUserId: item.ownerUserId,
          title: item.title,
          organization: item.organization,
          situation: item.situation,
          task: item.task,
          actions: item.actions,
          result: item.result,
          technologies: item.technologies,
          confidence: item.confidence,
          sourceType: item.sourceType,
          claimText: item.claimText,
          employerAssociation: item.employerAssociation,
          projectAssociation: item.projectAssociation,
          verificationStatus: item.verificationStatus,
          candidateConfirmationStatus: item.candidateConfirmationStatus ?? "confirmed",
          privacyLevel: item.privacyLevel,
          metrics: item.payload?.metrics,
          payload: item.payload,
        })),
        researchFindings: Array.isArray(research?.findings)
          ? (research!.findings as Array<Record<string, unknown>>)
          : [],
      });
      const mapped = mapPythonEvidenceMatchToTs(py);
      const usage = mapProviderUsage({
        provider: "python",
        model: "evidence-match",
        prompt_version: "evidence-match@lexical-v1",
        latency_ms: Date.now() - started,
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_cents: null,
      });
      result = {
        data: mapped,
        model: { provider: "python", model: "evidence-match" },
        prompt: { version: "evidence-match@lexical-v1" },
        usage: {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimatedCostCents: usage.estimatedCostCents,
          costUnknown: usage.costUnknown,
        },
        latencyMs: Date.now() - started,
      };
      promptVersion = "evidence-match@lexical-v1";
    } catch (error) {
      throw mapPythonBackendErrorToAppError(error);
    }
    await this.recordProviderUsage(run, usageKey, result);

    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      metadata: {
        ...(application?.metadata ?? {}),
        evidenceMatches: result.data.rows,
        evidenceCoverage: result.data.evidenceCoverage,
        jobRequirements: requirements,
      },
      evidenceCoverage: result.data.evidenceCoverage,
    });

    await this.commit(usageKey, this.commitCostCents(result.usage.estimatedCostCents), { tenantId: run.tenantId });
    await this.deps.engine.transition(run.id, "EVIDENCE_MATCHING_COMPLETED", {
      message: "Evidence matching completed",
      patch: { provider: result.model.provider, model: result.model.model, promptVersion },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "V0_GENERATING",
      workflowStage: "V0_GENERATING",
      evidenceCoverage: result.data.evidenceCoverage,
      status: "resume",
      nextAction: "Generate V0",
    });
    await this.deps.engine.transition(run.id, "V0_GENERATING", {
      message: "Resume V0 generation started automatically",
    });
  }

  private async runResumeGeneration(run: WorkflowRunRecord, versionNumber: number, triggeredBy: string) {
    const cycleBase = typeof run.payload.cycleBase === "number" ? run.payload.cycleBase : 0;
    const isFinalQaRepair = run.payload?.finalQaRepairAttempted === true;
    const repairAttempt =
      typeof run.payload.finalQaRepairAttempt === "number" ? run.payload.finalQaRepairAttempt : 1;
    const repairSourceVersion =
      typeof run.payload.finalQaRepairSourceVersion === "number"
        ? run.payload.finalQaRepairSourceVersion
        : null;
    const repairChecksHash =
      typeof run.payload.finalQaRepairChecksHash === "string" ? run.payload.finalQaRepairChecksHash : "na";
    const versionLabel = isFinalQaRepair ? `V4R${repairAttempt}` : `V${cycleBase + versionNumber}`;
    const effectiveTriggeredBy = isFinalQaRepair ? "final-qa-repair" : triggeredBy;
    const idempotencyKey = isFinalQaRepair
      ? `resume:${run.applicationPublicId}:repair:from${repairSourceVersion}:a${repairAttempt}:${repairChecksHash}:${run.idempotencyKey}`
      : `resume:${run.applicationPublicId}:v${cycleBase + versionNumber}:${run.idempotencyKey}`;
    const existingVersion = await this.deps.resumes.findVersionByIdempotency(run.tenantId, idempotencyKey);
    if (existingVersion) {
      const readyStage = `V${versionNumber}_READY` as WorkflowStage;
      await this.deps.engine.transition(run.id, readyStage, {
        message: isFinalQaRepair
          ? `${versionLabel} already exists (idempotent repair)`
          : `V${versionNumber} already exists (idempotent)`,
        outputVersion: String(existingVersion.versionNumber),
      });
      const nextRunning = [
        "HR_AUDIT_1_RUNNING",
        "EM_AUDIT_1_RUNNING",
        "HR_AUDIT_2_RUNNING",
        "EM_AUDIT_2_RUNNING",
        "FINAL_QA_RUNNING",
      ][versionNumber] as WorkflowStage;
      const continuePatch = isFinalQaRepair
        ? { payload: withoutStageClaims({ ...(run.payload ?? {}), finalQaRepairAttempted: true }) }
        : undefined;
      await this.deps.engine.transition(run.id, nextRunning, {
        message: "Continuing pipeline automatically",
        ...(continuePatch ? { patch: continuePatch } : {}),
      });
      return;
    }

    const generationOperationId = isFinalQaRepair
      ? `repair:v${repairSourceVersion}-to-v4r${repairAttempt}:attempt-${repairAttempt}:${repairChecksHash}`
      : `generate:v${cycleBase + versionNumber}`;
    const usageKey = await this.reserve(run, "resume_generation", 1, generationOperationId);
    const { application, evidence } = await this.listScopedEvidence(run);
    const payloadRefinement =
      typeof run.payload.refinementInstruction === "string" && run.payload.refinementInstruction.trim().length > 0
        ? run.payload.refinementInstruction
        : null;
    const metadataRefinement =
      typeof application?.metadata?.refinementInstruction === "string" &&
      String(application.metadata.refinementInstruction).trim().length > 0
        ? String(application.metadata.refinementInstruction)
        : null;
    // Metadata refinements apply on V0 and the final V4 lifecycle step so audit rewrites
    // cannot permanently erase the visible emphasis. Explicit payload refinements always apply.
    const resolvedRefinementInstruction =
      payloadRefinement ??
      ((versionNumber === 0 || versionNumber === 4) && !isFinalQaRepair ? metadataRefinement : null);
    const hasRefinementInstruction = Boolean(resolvedRefinementInstruction) || isFinalQaRepair;
    if (!evidence.length && versionNumber === 0 && !isFinalQaRepair) {
      throw new AppError(
        "PROFILE_EVIDENCE_REQUIRED",
        "Cannot generate a resume without owned career evidence for this candidate.",
        422,
      );
    }
    const research = await this.deps.research.getLatest(run.tenantId, run.applicationPublicId);
    const currentResume = await this.deps.resumes.getByApplication(run.tenantId, run.applicationPublicId);
    const previousVersions = currentResume ? await this.deps.resumes.listVersions(run.tenantId, currentResume.publicId) : [];
    let storedVersionNumber = cycleBase + versionNumber;
    if (isFinalQaRepair) {
      if (!currentResume) {
        throw new AppError("RESUME_NOT_FOUND", "Resume required for Final QA repair", 422);
      }
      storedVersionNumber = this.deps.resumes.allocateNextVersionNumber
        ? await this.deps.resumes.allocateNextVersionNumber(run.tenantId, currentResume.publicId)
        : Math.max(...previousVersions.map((v) => v.versionNumber), 0) + 1;
      await this.deps.workflows.updateRun(run.id, {
        payload: { ...run.payload, finalQaRepairVersionNumber: storedVersionNumber },
      });
    }
    // Final-QA repair must start from the failed latest V4 — never fall back to V3.
    const previousVersion = isFinalQaRepair
      ? previousVersions.find((version) => version.versionNumber === repairSourceVersion) ??
        previousVersions.at(-1) ??
        null
      : previousVersions.find((version) => version.versionNumber === storedVersionNumber - 1);
    if (isFinalQaRepair && (!previousVersion || previousVersion.versionNumber !== repairSourceVersion)) {
      throw new AppError(
        "RESUME_VERSION_NOT_FOUND",
        "Final QA repair requires the failed V4 revision as previousResume",
        422,
      );
    }
    const auditRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
    const previousAudit = auditRuns.at(-1);
    const auditFindings = previousAudit ? await this.deps.audits.listFindings(run.tenantId, previousAudit.publicId) : [];
    const actionable = filterFindingsForNextGeneration(auditFindings);
    const mistakeMemory = await listActiveMistakeMemory(this.deps.store, run.tenantId, run.applicationId);
    const attestedTechnologies = claimableTechnologies(
      (application?.metadata?.techQuestions ?? []) as TechQuestion[],
    );
    const evidenceTechnologies = [...new Set([
      ...evidence.flatMap((item) => item.technologies),
      ...attestedTechnologies,
    ])];

    await this.ensureExecutionBackendPersisted(run);
    let result: ResumeGenerationResult;
    // Python is the only backend — no TypeScript fallback
    await this.recordStageBackend(run, versionNumber === 0 ? "generate" : "regenerate", "python");
    const { getPythonIntelligenceClient, mapPythonBackendErrorToAppError } = await import("../intelligence/python-client");
    {
      const client = getPythonIntelligenceClient();
      const context = {
        tenantId: run.tenantId,
        userId: application?.ownerUserId ?? "unknown",
        applicationId: run.applicationPublicId,
        workflowRunId: run.publicId,
        requestId: run.id,
      };
      const evidencePayload = evidence.map((item) => ({
        id: item.publicId,
        tenantId: item.tenantId,
        ownerUserId: item.ownerUserId,
        title: item.title,
        organization: item.organization,
        situation: item.situation,
        task: item.task,
        actions: item.actions,
        result: item.result,
        technologies: item.technologies,
        confidence: item.confidence,
        sourceType: item.sourceType,
        claimText: item.claimText,
        employerAssociation: item.employerAssociation,
        projectAssociation: item.projectAssociation,
        verificationStatus: item.verificationStatus,
        candidateConfirmationStatus: item.candidateConfirmationStatus ?? "confirmed",
        privacyLevel: item.privacyLevel,
        metrics: item.payload?.metrics,
        payload: item.payload,
      }));
      const rejectedFindings = auditFindings.filter((finding) => finding.status === "rejected");
      const researchFindings = Array.isArray(research?.findings)
        ? (research.findings as Array<Record<string, unknown>>)
        : [];
      const jobRequirements = Array.isArray(application?.metadata?.jobRequirements)
        ? (application.metadata.jobRequirements as unknown[]).filter((item): item is string => typeof item === "string")
        : [];
      const evidenceMatches = Array.isArray(application?.metadata?.evidenceMatches)
        ? (application.metadata.evidenceMatches as Array<Record<string, unknown>>)
        : [];
      const techQuestions = (application?.metadata?.techQuestions ?? []) as TechQuestion[];
      const userConfirmations = techQuestions
        .filter(
          (question) =>
            question.answer === "yes_professional" ||
            question.answer === "yes_project" ||
            question.answer === "no" ||
            question.answer === "similar" ||
            question.answer === "not_sure",
        )
        .map((question) => ({
          topic: question.technology,
          confirmed: question.answer === "yes_professional" || question.answer === "yes_project",
          evidenceDescription: question.evidence?.trim() || null,
          sourceKind: "user_confirmation",
          relatedEvidenceIds: [],
        }));
      const generateInput = {
        context,
        absoluteVersion: storedVersionNumber,
        cycleStep: versionNumber,
        jobDescription: String(application?.metadata?.jobDescription ?? ""),
        evidence: evidencePayload,
        allowedTechnologies: evidenceTechnologies,
        previousResume: previousVersion
          ? {
              versionNumber: previousVersion.versionNumber,
              absoluteVersion: previousVersion.versionNumber,
              cycleStep: previousVersion.versionNumber % 5,
              score: previousVersion.score,
              scoreBreakdown: previousVersion.scoreBreakdown ?? {},
              notes: previousVersion.notes ?? "",
              sections: previousVersion.sections as Array<Record<string, unknown>>,
            }
          : null,
        acceptedFindings: actionable as unknown as Array<Record<string, unknown>>,
        rejectedFindings: rejectedFindings as unknown as Array<Record<string, unknown>>,
        researchFindings,
        mistakeMemory: mistakeMemory as unknown as Array<Record<string, unknown>>,
        refinementInstruction: isFinalQaRepair ? null : resolvedRefinementInstruction,
        finalQaRepair: isFinalQaRepair
          ? ((run.payload.finalQaRepairDirective as {
              repairType: "final_qa_repair";
              sourceVersion: number;
              sourceVersionLabel?: string | null;
              attempt: number;
              failedChecks: Array<{ label: string; status: string; detail?: string }>;
              approvedEvidenceIds?: string[];
              groundedTargets?: string[];
            } | undefined) ?? {
              repairType: "final_qa_repair" as const,
              sourceVersion: Number(repairSourceVersion),
              sourceVersionLabel:
                typeof run.payload.finalQaRepairSourceLabel === "string"
                  ? String(run.payload.finalQaRepairSourceLabel)
                  : `V${repairSourceVersion}`,
              attempt: repairAttempt,
              failedChecks: Array.isArray(run.payload.finalQaFailedChecks)
                ? (run.payload.finalQaFailedChecks as Array<{ label: string; status: string; detail?: string }>)
                : [],
              approvedEvidenceIds: evidence.map((item) => item.publicId),
              groundedTargets: evidenceTechnologies.slice(0, 8),
            })
          : null,
        jobRequirements,
        evidenceMatches,
        userConfirmations,
        idempotencyKey,
      };
      try {
        const py =
          versionNumber === 0
            ? await client.generateResume(generateInput)
            : await client.regenerateResume(generateInput);
        result = {
          data: resumeSchema.parse(py.resume),
          rawText: "",
          model: { provider: py.provider, model: py.model, temperature: 0, maxOutputTokens: 0 },
          prompt: {
            id: versionNumber === 0 ? "resume-generation" : "resume-regeneration",
            version: py.promptVersion || "python@v1",
            rubricVersion: "candidarc-rubric@v1",
          },
          usage: {
            inputTokens: py.usage.inputTokens,
            outputTokens: py.usage.outputTokens,
            estimatedCostCents: py.usage.estimatedCostCents,
          },
          latencyMs: py.latencyMs,
        };
      } catch (error) {
        const mapped = mapPythonBackendErrorToAppError(error);
        // Metadata re-emphasis on V4 is best-effort: if the visible resume already
        // satisfies the instruction, continue without inventing further changes.
        const metadataOnlyRetry =
          mapped.code === "REFINEMENT_NOT_APPLICABLE" &&
          !payloadRefinement &&
          Boolean(metadataRefinement) &&
          !isFinalQaRepair &&
          versionNumber > 0;
        if (!metadataOnlyRetry) {
          logger.warn({ err: error, applicationPublicId: run.applicationPublicId }, "python resume generation failed");
          throw mapped;
        }
        logger.info(
          { applicationPublicId: run.applicationPublicId, versionNumber },
          "metadata refinement already satisfied — regenerating without refinement",
        );
        const py = await client.regenerateResume({
          ...generateInput,
          refinementInstruction: null,
        });
        result = {
          data: resumeSchema.parse(py.resume),
          rawText: "",
          model: { provider: py.provider, model: py.model, temperature: 0, maxOutputTokens: 0 },
          prompt: {
            id: "resume-regeneration",
            version: py.promptVersion || "python@v1",
            rubricVersion: "candidarc-rubric@v1",
          },
          usage: {
            inputTokens: py.usage.inputTokens,
            outputTokens: py.usage.outputTokens,
            estimatedCostCents: py.usage.estimatedCostCents,
          },
          latencyMs: py.latencyMs,
        };
      }
    }
    await this.recordProviderUsage(run, usageKey, result);

    // Only restore previous sections when there is no refinement, no Final-QA repair,
    // and no other explicit regeneration request with actionable findings already applied.
    if (
      versionNumber > 0 &&
      previousVersion &&
      actionable.length === 0 &&
      !isFinalQaRepair &&
      !hasRefinementInstruction
    ) {
      result.data.sections = previousVersion.sections as typeof result.data.sections;
    }

    let resume = await this.deps.resumes.getByApplication(run.tenantId, run.applicationPublicId);
    if (!resume) {
      resume = await this.deps.resumes.createResume({
        id: newId("res"),
        publicId: newId("resp"),
        tenantId: run.tenantId,
        applicationId: run.applicationId,
        applicationPublicId: run.applicationPublicId,
        title: `${run.applicationPublicId} resume`,
        templateId: "alumni-clean",
        length: "one-page",
        currentVersionPublicId: null,
      });
    }

    const versionPayload = () => ({
      id: newId("rv"),
      publicId: newId(`rvv${storedVersionNumber}`),
      tenantId: run.tenantId,
      resumeId: resume.id,
      versionNumber: storedVersionNumber,
      versionLabel,
      score: result.data.score,
      scoreBreakdown: result.data.scoreBreakdown,
      notes: result.data.notes,
      triggeredBy: effectiveTriggeredBy,
      sections: withResumeProvenance(
        result.data.sections as Array<Record<string, unknown>>,
        storedVersionNumber,
      ),
      idempotencyKey,
      promptVersion: result.prompt.version,
    });

    let version;
    try {
      version = await this.deps.resumes.appendVersion(versionPayload());
    } catch (error) {
      if (!isFinalQaRepair || !(error instanceof AppError) || error.code !== "RESUME_VERSION_CONFLICT") {
        throw error;
      }
      // Concurrent repair safety: unique (resume_id, version_number) may race after allocate.
      // Reuse by idempotency key, or reallocate and retry insert without a second provider call.
      const existing = await this.deps.resumes.findVersionByIdempotency(run.tenantId, idempotencyKey);
      if (existing) {
        version = existing;
        storedVersionNumber = existing.versionNumber;
      } else {
        version = undefined;
        for (let retry = 0; retry < 5; retry++) {
          if (this.deps.resumes.allocateNextVersionNumber) {
            storedVersionNumber = await this.deps.resumes.allocateNextVersionNumber(
              run.tenantId,
              resume.publicId,
            );
          } else {
            const latestNums = (await this.deps.resumes.listVersions(run.tenantId, resume.publicId)).map(
              (item) => item.versionNumber,
            );
            storedVersionNumber = (latestNums.length ? Math.max(...latestNums) : -1) + 1;
          }
          try {
            version = await this.deps.resumes.appendVersion(versionPayload());
            break;
          } catch (retryError) {
            if (!(retryError instanceof AppError) || retryError.code !== "RESUME_VERSION_CONFLICT") {
              throw retryError;
            }
            const raced = await this.deps.resumes.findVersionByIdempotency(run.tenantId, idempotencyKey);
            if (raced) {
              version = raced;
              storedVersionNumber = raced.versionNumber;
              break;
            }
          }
        }
        if (!version) {
          throw new AppError("RESUME_VERSION_CONFLICT", "Unable to allocate Final QA repair version", 409);
        }
      }
    }

    await this.deps.resumes.setCurrentVersion(run.tenantId, resume.publicId, version.publicId);
    await this.commit(usageKey, this.commitCostCents(result.usage.estimatedCostCents), { tenantId: run.tenantId });

    const readyStage = `V${versionNumber}_READY` as WorkflowStage;
    await this.deps.engine.transition(run.id, readyStage, {
      message: `Resume V${versionNumber} ready`,
      outputVersion: String(versionNumber),
      patch: {
        provider: result.model.provider,
        model: result.model.model,
        promptVersion: result.prompt.version,
        tokenUsage: {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
          total: result.usage.inputTokens + result.usage.outputTokens,
        },
      },
    });

    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: readyStage,
      workflowStage: readyStage,
      resumeScore: result.data.score,
      atsAlignment: result.data.scoreBreakdown.atsCompatibility,
      resumePublicId: resume.publicId,
      status: versionNumber >= 4 ? "final-qa" : "auditing",
      nextAction: versionNumber >= 4 ? "Run Final QA" : `Start next audit`,
    });

    const nextRunning = [
      "HR_AUDIT_1_RUNNING",
      "EM_AUDIT_1_RUNNING",
      "HR_AUDIT_2_RUNNING",
      "EM_AUDIT_2_RUNNING",
      "FINAL_QA_RUNNING",
    ][versionNumber] as WorkflowStage;
    // Final-QA re-entry after repair must not be blocked by the prior FINAL_QA claim lease.
    const nextPayload = isFinalQaRepair ? withoutStageClaims({ ...(run.payload ?? {}) }) : undefined;
    await this.deps.engine.transition(run.id, nextRunning, {
      message: versionNumber >= 4 ? "Final QA started automatically" : "Next audit started automatically",
      ...(nextPayload ? { patch: { payload: nextPayload } } : {}),
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: nextRunning,
      workflowStage: nextRunning,
      nextAction: versionNumber >= 4 ? "Running Final QA" : "Running audit",
    });
  }

  private async runAudit(
    run: WorkflowRunRecord,
    promptId: "hr-audit-1" | "em-audit-1" | "hr-audit-2" | "em-audit-2",
    reviewsVersion: number,
    producesVersion: number,
  ) {
    assertAuditOrder({
      stage: run.stage,
      reviewsVersion,
      producesVersion,
    });

    const usageKey = await this.reserve(run, "audit", 1, `audit:${promptId}:v${reviewsVersion}`);
    const application = await this.deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
    const { evidence } = await this.listScopedEvidence(run);
    const resume = await this.deps.resumes.getByApplication(run.tenantId, run.applicationPublicId);
    if (!resume) throw new AppError("RESUME_NOT_FOUND", "Resume required for audit", 422);
    const versions = await this.deps.resumes.listVersions(run.tenantId, resume.publicId);
    const cycleBase = typeof run.payload.cycleBase === "number" ? run.payload.cycleBase : 0;
    const storedReviewsVersion = cycleBase + reviewsVersion;
    const storedProducesVersion = cycleBase + producesVersion;
    const reviewedResume = versions.find((version) => version.versionNumber === storedReviewsVersion);
    if (!reviewedResume) throw new AppError("RESUME_VERSION_NOT_FOUND", `Required resume version not found`, 422);
    const lensMap = {
      "hr-audit-1": "hr-1",
      "em-audit-1": "em-1",
      "hr-audit-2": "hr-2",
      "em-audit-2": "em-2",
    } as const;
    const lens = lensMap[promptId];
    const auditIdempotencyKey = `audit:${run.applicationPublicId}:${lens}:v${storedReviewsVersion}:${run.idempotencyKey}`;
    await this.ensureExecutionBackendPersisted(run);
    let result: AuditGenerationResult;
    // Python is the only backend — no TypeScript fallback
    await this.recordStageBackend(run, "audit", "python");
    const { getPythonIntelligenceClient, mapPythonBackendErrorToAppError } = await import("../intelligence/python-client");
    const { auditSchema: auditOutputSchema } = await import("../ai/schemas");
    const client = getPythonIntelligenceClient();
    try {
      const py = await client.auditResume({
          context: {
            tenantId: run.tenantId,
            userId: application?.ownerUserId ?? "unknown",
            applicationId: run.applicationPublicId,
            workflowRunId: run.publicId,
            requestId: run.id,
          },
          lens,
          reviewsVersion: storedReviewsVersion,
          producesVersion: storedProducesVersion,
          resume: {
            versionNumber: reviewedResume.versionNumber,
            absoluteVersion: reviewedResume.versionNumber,
            cycleStep: reviewedResume.versionNumber % 5,
            score: reviewedResume.score,
            scoreBreakdown: reviewedResume.scoreBreakdown ?? {},
            notes: reviewedResume.notes ?? "",
            sections: reviewedResume.sections as Array<Record<string, unknown>>,
          },
          evidence: evidence.map((item) => ({
            id: item.publicId,
            tenantId: item.tenantId,
            ownerUserId: item.ownerUserId,
            title: item.title,
            organization: item.organization,
            situation: item.situation,
            task: item.task,
            actions: item.actions,
            result: item.result,
            technologies: item.technologies,
            confidence: item.confidence,
            sourceType: item.sourceType,
            claimText: item.claimText,
            employerAssociation: item.employerAssociation,
            projectAssociation: item.projectAssociation,
            verificationStatus: item.verificationStatus,
            candidateConfirmationStatus: item.candidateConfirmationStatus ?? "confirmed",
            privacyLevel: item.privacyLevel,
            metrics: item.payload?.metrics,
            payload: item.payload,
          })),
          jobDescription: String(application?.metadata?.jobDescription ?? ""),
          allowedTechnologies: claimableTechnologies(
            (application?.metadata?.techQuestions ?? []) as TechQuestion[],
          ),
          idempotencyKey: auditIdempotencyKey,
        });
        result = {
          data: auditOutputSchema.parse(py.data),
          rawText: "",
          model: { provider: py.provider, model: py.model, temperature: 0, maxOutputTokens: 0 },
          prompt: { id: promptId, version: "python-audit@v1", rubricVersion: "candidarc-rubric@v1" },
          usage: {
            inputTokens: py.usage.inputTokens,
            outputTokens: py.usage.outputTokens,
            estimatedCostCents: py.usage.estimatedCostCents,
          },
          latencyMs: py.latencyMs,
        };
    } catch (error) {
      logger.warn({ err: error, applicationPublicId: run.applicationPublicId }, "python audit failed");
      throw mapPythonBackendErrorToAppError(error);
    }
    await this.recordProviderUsage(run, usageKey, result);

    const expectedRule = AUDIT_SEQUENCE.find((rule) => rule.stage === run.stage);
    if (expectedRule && result.data.lens !== expectedRule.lens) {
      logger.warn(
        { expectedLens: expectedRule.lens, actualLens: result.data.lens, stage: run.stage },
        "audit lens mismatch — skipping invalid audit output",
      );
      await this.commit(usageKey, this.commitCostCents(result.usage.estimatedCostCents), { tenantId: run.tenantId });
      const nextStage = (`V${producesVersion}_GENERATING`) as WorkflowStage;
      await this.deps.engine.transition(run.id, nextStage, {
        message: "Skipped audit with mismatched lens",
      });
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: nextStage,
        workflowStage: nextStage,
        status: "resume",
        nextAction: "Creating tailored resume",
      });
      return;
    }

    const existingRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
    const already = existingRuns.find((r) => r.lens === result.data.lens && r.reviewsVersion === `V${storedReviewsVersion}`);
    if (!already) {
      const audit = await this.deps.audits.createRun({
        id: newId("ar"),
        publicId: newId("arp"),
        tenantId: run.tenantId,
        applicationId: run.applicationId,
        applicationPublicId: run.applicationPublicId,
        lens: result.data.lens,
        label: promptId.replace("-", " ").toUpperCase(),
        reviewsVersion: `V${storedReviewsVersion}`,
        producesVersion: `V${storedProducesVersion}`,
        status: "in-progress",
        scoreBefore: result.data.scoreBefore,
        scoreAfter: result.data.scoreAfter,
        summary: result.data.summary,
      });
      await this.deps.audits.createFindings(
        result.data.findings.map((f) => ({
          publicId: newId("afp"),
          tenantId: run.tenantId,
          auditRunId: audit.id,
          auditRunPublicId: audit.publicId,
          severity: f.severity,
          status: "open",
          section: f.section,
          title: f.title,
          explanation: f.explanation,
          beforeText: f.beforeText,
          suggestedText: f.suggestedText,
          evidenceSource: f.evidenceSource,
          expectedScoreImpact: f.expectedScoreImpact,
        })),
      );
    }

    await this.commit(usageKey, this.commitCostCents(result.usage.estimatedCostCents), { tenantId: run.tenantId });

    const reviewStage = run.stage.replace("_RUNNING", "_REVIEW") as WorkflowStage;
    await this.deps.engine.transition(run.id, reviewStage, {
      message: `${promptId} ready for review`,
      patch: { promptVersion: result.prompt.version, provider: result.model.provider, model: result.model.model },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: reviewStage,
      workflowStage: reviewStage,
      status: "auditing",
      nextAction: "Review findings",
    });

    if (application?.metadata?.autoAdvanceAudits === true) {
      const latestRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
      const latestAudit = latestRuns.find(
        (item) => item.lens === result.data.lens && item.reviewsVersion === `V${storedReviewsVersion}`,
      );
      if (!latestAudit) throw new AppError("AUDIT_NOT_FOUND", "Audit result was not persisted", 500);
      const findings = await this.deps.audits.listFindings(run.tenantId, latestAudit.publicId);
      const attestedTechnologies = claimableTechnologies(
        (application?.metadata?.techQuestions ?? []) as TechQuestion[],
      );
      const adjudicationCtx = buildAdjudicationContext({
        evidence,
        attestedTechnologies,
      });
      const adjudicatedRaw = adjudicateFindings(
        findings.filter((finding) => finding.status === "open"),
        adjudicationCtx,
      );
      const needsUser = adjudicatedRaw.filter((item) => item.adjudication === "needs_user");
      const adjudicated = adjudicatedRaw.map((item) =>
        item.adjudication === "needs_user"
          ? { ...item, adjudication: "rejected" as const, adjudicationReason: item.adjudicationReason || "Factual claim needs evidence confirmation" }
          : item,
      );

      await Promise.all(
        adjudicated.map((finding) =>
          this.deps.audits.updateFindingDecision(
            run.tenantId,
            finding.publicId,
            finding.adjudication === "accepted" ? "accepted" : "rejected",
          ),
        ),
      );
      for (const finding of adjudicated.filter(
        (item) =>
          item.adjudication === "accepted" &&
          (item.severity === "critical" || item.severity === "major"),
      )) {
        await addMistakeMemoryRule(this.deps.store, {
          tenantId: run.tenantId,
          applicationId: run.applicationId,
          originatingAudit: latestAudit.lens,
          affectedVersion: latestAudit.reviewsVersion,
          category: finding.section,
          rule: finding.suggestedText ?? finding.title,
          severity: finding.severity,
          status: "active",
          userOverride: false,
          appliedIn: [`V${storedProducesVersion}`],
        });
      }
      await this.deps.audits.updateRun(run.tenantId, latestAudit.publicId, {
        status: "completed",
        completedAt: nowIso(),
      });
      const nextStage = (`V${producesVersion}_GENERATING`) as WorkflowStage;
      await this.deps.engine.transition(run.id, nextStage, {
        message: "Customer audit applied after adjudication",
      });
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: nextStage,
        workflowStage: nextStage,
        status: "resume",
        nextAction: "Creating tailored resume",
        metadata: {
          ...(application.metadata ?? {}),
          pendingAdjudication: [],
          optionalEnhancements: needsUser.map((item) => ({
            findingPublicId: item.publicId,
            reason: item.adjudicationReason,
            title: item.title,
          })),
          lastAdjudication: adjudicated.map((item) => ({
            findingPublicId: item.publicId,
            decision: item.adjudication,
            reason: item.adjudicationReason,
          })),
        },
      });
    }
  }

  private async runFinalQa(run: WorkflowRunRecord) {
    const resume = await this.deps.resumes.getByApplication(run.tenantId, run.applicationPublicId);
    if (!resume) throw new AppError("RESUME_NOT_FOUND", "Resume required for Final QA", 422);
    const versions = await this.deps.resumes.listVersions(run.tenantId, resume.publicId);
    const latest = versions.at(-1);
    if (!latest) throw new AppError("RESUME_VERSION_NOT_FOUND", "Resume version required for Final QA", 422);
    const auditRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
    const findings = (await Promise.all(auditRuns.map((audit) => this.deps.audits.listFindings(run.tenantId, audit.publicId)))).flat();
    const { evidence } = await this.listScopedEvidence(run);
    const application = await this.deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
    const attestedTechnologies = claimableTechnologies(
      (application?.metadata?.techQuestions ?? []) as TechQuestion[],
    );
    const knownTechnologies = [...new Set([
      ...evidence.flatMap((item) => item.technologies),
      ...attestedTechnologies,
    ])];
    const result = runDeterministicFinalQa({
      sections: latest.sections,
      unresolvedCriticalFindings: findings.filter((finding) => finding.severity === "critical" && finding.status === "open").length,
      knownEvidenceIds: evidence.map((item) => item.publicId),
      knownTechnologies,
      attestedTechnologies,
    });

    if (!result.passed) {
      await this.deps.engine.transition(run.id, "FINAL_QA_FAILED", {
        status: "failed",
        message: "Final QA failed",
        patch: {
          payload: {
            ...run.payload,
            failedAtStage: "FINAL_QA_RUNNING",
            finalQaChecks: result.checks,
          },
        },
      });
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: "FINAL_QA_FAILED",
        workflowStage: "FINAL_QA_FAILED",
        status: "failed",
        nextAction: "Retry resume generation",
      });
      throw new AppError("FINAL_QA_FAILED", "Final QA checks failed", 422, result.checks);
    }

    // AI Final QA supplement - Python is the only backend
    const finalQaOperationId = `final-qa:v${latest.versionNumber}`;
    const usageKey = await this.reserve(run, "final_review", 1, finalQaOperationId);
    await this.ensureExecutionBackendPersisted(run);
    const finalQaIdempotencyKey = `final-qa:${run.applicationPublicId}:v${latest.versionNumber}:${run.idempotencyKey}`;
    let supplement: FinalQaSupplementResult;

    await this.recordStageBackend(run, "final-qa", "python");
    const { getPythonIntelligenceClient, mapPythonBackendErrorToAppError } = await import("../intelligence/python-client");
    const { finalQaSchema: finalQaOutputSchema } = await import("../ai/schemas");
    const client = getPythonIntelligenceClient();
    try {
      const py = await client.finalQa({
        context: {
          tenantId: run.tenantId,
          userId: application?.ownerUserId ?? "unknown",
          applicationId: run.applicationPublicId,
          workflowRunId: run.publicId,
          requestId: run.id,
        },
        resume: {
          versionNumber: latest.versionNumber,
          absoluteVersion: latest.versionNumber,
          cycleStep: latest.versionNumber % 5,
          score: latest.score,
          scoreBreakdown: latest.scoreBreakdown ?? {},
          notes: latest.notes ?? "",
          sections: latest.sections as Array<Record<string, unknown>>,
        },
        evidence: evidence.map((item) => ({
          id: item.publicId,
          tenantId: item.tenantId,
          ownerUserId: item.ownerUserId,
          title: item.title,
          organization: item.organization,
          situation: item.situation,
          task: item.task,
          actions: item.actions,
          result: item.result,
          technologies: item.technologies,
          confidence: item.confidence,
          sourceType: item.sourceType,
          claimText: item.claimText,
          employerAssociation: item.employerAssociation,
          projectAssociation: item.projectAssociation,
          verificationStatus: item.verificationStatus,
          candidateConfirmationStatus: item.candidateConfirmationStatus ?? "confirmed",
          privacyLevel: item.privacyLevel,
          metrics: item.payload?.metrics,
          payload: item.payload,
        })),
        deterministicChecks: result.checks as unknown as Array<Record<string, unknown>>,
        allowedTechnologies: knownTechnologies,
        idempotencyKey: finalQaIdempotencyKey,
      });
      supplement = {
        data: finalQaOutputSchema.parse(py.data),
        rawText: "",
        model: { provider: py.provider, model: py.model, temperature: 0, maxOutputTokens: 0 },
        prompt: { id: "final-qa", version: "final-qa@python-v2", rubricVersion: "candidarc-rubric@v1" },
        usage: {
          inputTokens: py.usage.inputTokens,
          outputTokens: py.usage.outputTokens,
          estimatedCostCents: py.usage.estimatedCostCents,
        },
        latencyMs: py.latencyMs,
      };
    } catch (error) {
      logger.warn({ err: error, applicationPublicId: run.applicationPublicId }, "python final QA failed");
      throw mapPythonBackendErrorToAppError(error);
    }
    await this.recordProviderUsage(run, usageKey, supplement);
    await this.commit(usageKey, this.commitCostCents(supplement.usage.estimatedCostCents), { tenantId: run.tenantId });

    // Final QA authority: if AI final QA fails, attempt ONE bounded repair
    if (supplement.data.passed === false) {
      const repairAttempted = run.payload?.finalQaRepairAttempted === true;
      if (repairAttempted) {
        // Already attempted repair — fail permanently
        logger.warn(
          { applicationPublicId: run.applicationPublicId, checks: supplement.data.checks },
          "Final QA failed after repair attempt",
        );
        await this.deps.engine.transition(run.id, "FINAL_QA_FAILED", {
          status: "failed",
          message: "Final QA failed after repair attempt",
          patch: {
            payload: {
              ...run.payload,
              failedAtStage: "FINAL_QA_RUNNING",
              finalQaChecks: supplement.data.checks,
              aiFinalQaFailed: true,
            },
          },
        });
        await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
          stage: "FINAL_QA_FAILED",
          workflowStage: "FINAL_QA_FAILED",
          status: "failed",
          nextAction: "Resume quality checks failed. Please review and retry.",
        });
        throw new AppError("FINAL_QA_FAILED", "Final QA checks failed after repair attempt", 422, supplement.data.checks);
      }

      // Attempt bounded repair: create a new immutable V4R1 revision from failed V4
      logger.info(
        { applicationPublicId: run.applicationPublicId, failedChecks: supplement.data.checks.filter((c) => c.status !== "pass") },
        "Final QA failed — attempting bounded repair",
      );
      const failedChecks = supplement.data.checks.filter((check) => check.status !== "pass");
      const failedCheckSummary = failedChecks
        .map((check) => `${check.label}: ${check.detail}`)
        .join("; ");
      const checksHash = hashFinalQaChecks(supplement.data.checks);
      const finalQaRepairDirective = {
        repairType: "final_qa_repair" as const,
        sourceVersion: latest.versionNumber,
        sourceVersionLabel: latest.versionLabel,
        attempt: 1,
        failedChecks: failedChecks.map((check) => ({
          label: check.label,
          status: check.status,
          detail: check.detail,
        })),
        approvedEvidenceIds: evidence.map((item) => item.publicId),
        groundedTargets: knownTechnologies.slice(0, 8),
      };

      const repairPayload = withoutStageClaims({
        ...run.payload,
        finalQaRepairAttempted: true,
        finalQaRepairAttempt: 1,
        finalQaRepairSourceVersion: latest.versionNumber,
        finalQaRepairSourcePublicId: latest.publicId,
        finalQaRepairSourceLabel: latest.versionLabel,
        finalQaRepairChecksHash: checksHash,
        finalQaRepairReason: failedCheckSummary,
        finalQaFailedChecks: supplement.data.checks,
        finalQaRepairDirective,
        // Version number allocated under lock at generation time
        finalQaRepairVersionNumber: undefined,
        // Never smuggle repair through free-form refinement_instruction
        refinementInstruction: undefined,
      });

      await this.deps.workflows.updateRun(run.id, { payload: repairPayload });

      await this.deps.engine.transition(run.id, "V4_GENERATING", {
        status: "running",
        message: `Bounded repair: generating V4R1 from failed V${latest.versionNumber}`,
        patch: { payload: repairPayload },
      });
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: "V4_GENERATING",
        workflowStage: "V4_GENERATING",
        status: "resume",
        nextAction: "Regenerating to fix quality issues",
      });
      return; // Let the regeneration stage handle the next steps
    }

    await this.deps.engine.transition(run.id, "FINAL_READY", {
      message: "Final QA passed",
      status: "completed",
      patch: { payload: { ...run.payload, finalQa: result, aiFinalReview: supplement.data } },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "FINAL_READY",
      workflowStage: "FINAL_READY",
      status: "ready",
      nextAction: "Export resume",
      metadata: {
        ...(application?.metadata ?? {}),
        qualityReport: computeCandidArcQualityScore({
          sections: latest.sections as Array<Record<string, unknown>>,
          jobRequirements: Array.isArray(application?.metadata?.jobRequirements)
            ? (application.metadata.jobRequirements as unknown[]).filter((item): item is string => typeof item === "string")
            : [],
          knownTechnologies,
          pageCount: result.estimatedPages,
          aiRoleAlignment: Number((latest.scoreBreakdown as Record<string, number> | undefined)?.jobAlignment ?? latest.score),
          aiAtsReadability: Number((latest.scoreBreakdown as Record<string, number> | undefined)?.atsCompatibility),
        }),
        knownTechnologies,
      },
    });
    await this.deps.queue?.enqueue(
      "pdf-rendering",
      "customer-resume.render",
      {
        tenantId: run.tenantId,
        applicationId: run.applicationPublicId,
        applicationPublicId: run.applicationPublicId,
        versionId: latest.publicId,
        versionPublicId: latest.publicId,
        workflowId: run.publicId,
        workflowPublicId: run.publicId,
        workflowRunId: run.id,
        ownerUserId: application?.ownerUserId,
      },
      { idempotencyKey: `customer-render:${run.applicationPublicId}:${latest.publicId}` },
    );
  }
}
