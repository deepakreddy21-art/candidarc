import { getGenerationProvider } from "../ai";
import { getPrompt } from "../ai/prompt-registry";
import {
  mockAuditSchema,
  mockEvidenceMatchSchema,
  mockFinalQaSchema,
  mockResearchSchema,
  mockResumeSchema,
} from "../ai/mock-provider";
import type {
  ApplicationRepository,
  AuditRepository,
  ResearchRepository,
  Repositories,
  ResumeRepository,
  UsageRepository,
  WorkflowRunRecord,
} from "../database/repositories";
import { newId, nowIso } from "../database/repositories";
import { AppError, type WorkflowStage } from "../domain/types";
import { logger } from "../observability/logger";
import { assertAuditOrder } from "./stages";
import type { DurableWorkflowEngine } from "./engine";

export type ResumePipelineDeps = {
  engine: DurableWorkflowEngine;
  applications: ApplicationRepository;
  research: ResearchRepository;
  resumes: ResumeRepository;
  audits: AuditRepository;
  usage: UsageRepository;
};

/**
 * Application service orchestrating the vertical slice handlers.
 * Each handler is invoked by workers after queue delivery — not from HTTP.
 */
export class ResumePipeline {
  constructor(private readonly deps: ResumePipelineDeps) {}

  static fromRepos(repos: Repositories, engine: DurableWorkflowEngine) {
    return new ResumePipeline({
      engine,
      applications: repos.applications,
      research: repos.research,
      resumes: repos.resumes,
      audits: repos.audits,
      usage: repos.usage,
    });
  }

  async handleStage(run: WorkflowRunRecord): Promise<void> {
    if (run.status === "cancelled") return;

    switch (run.stage) {
      case "RESEARCH_QUEUED":
      case "RESEARCH_RUNNING":
        await this.runResearch(run);
        break;
      case "EVIDENCE_MATCHING_RUNNING":
        await this.runEvidenceMatching(run);
        break;
      case "V0_GENERATING":
        await this.runResumeGeneration(run, 0, "Initial generation");
        break;
      case "HR_AUDIT_1_RUNNING":
        await this.runAudit(run, "hr-audit-1", 0, 1);
        break;
      case "V1_GENERATING":
        await this.runResumeGeneration(run, 1, "HR Audit 1");
        break;
      case "EM_AUDIT_1_RUNNING":
        await this.runAudit(run, "em-audit-1", 1, 2);
        break;
      case "V2_GENERATING":
        await this.runResumeGeneration(run, 2, "EM Audit 1");
        break;
      case "HR_AUDIT_2_RUNNING":
        await this.runAudit(run, "hr-audit-2", 2, 3);
        break;
      case "V3_GENERATING":
        await this.runResumeGeneration(run, 3, "HR Audit 2");
        break;
      case "EM_AUDIT_2_RUNNING":
        await this.runAudit(run, "em-audit-2", 3, 4);
        break;
      case "V4_GENERATING":
        assertAuditOrder({ stage: "V4_GENERATING", reviewsVersion: 3, producesVersion: 4 });
        await this.runResumeGeneration(run, 4, "EM Audit 2");
        break;
      case "FINAL_QA_RUNNING":
        await this.runFinalQa(run);
        break;
      default:
        logger.debug({ stage: run.stage }, "pipeline no-op stage");
    }
  }

  private async reserve(run: WorkflowRunRecord, kind: string, units: number) {
    const key = `usage:${run.idempotencyKey}:${run.stage}:${kind}`;
    await this.deps.usage.append({
      tenantId: run.tenantId,
      kind,
      units: String(units),
      costCents: "0",
      workflowRunId: run.id,
      idempotencyKey: key,
      status: "reserved",
      metadata: { stage: run.stage },
    });
    return key;
  }

  private async commit(key: string, costCents: string) {
    const entry = await this.deps.usage.findByIdempotency(key);
    if (!entry) return;
    await this.deps.usage.updateStatus(key, "committed");
    if (costCents !== entry.costCents) {
      await this.deps.usage.append({
        tenantId: entry.tenantId,
        userId: entry.userId,
        kind: "provider_cost",
        units: "0",
        costCents,
        workflowRunId: entry.workflowRunId,
        idempotencyKey: `${key}:cost`,
        status: "committed",
        metadata: {},
      });
    }
  }

  private async runResearch(run: WorkflowRunRecord) {
    if (run.stage === "RESEARCH_QUEUED") {
      await this.deps.engine.transition(run.id, "RESEARCH_RUNNING", { message: "Research started" });
      run = (await this.deps.engine.getStatus(run.tenantId, run.publicId))!;
    }

    const usageKey = await this.reserve(run, "research", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt("research-synthesis");

    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ applicationPublicId: run.applicationPublicId }),
      schema: mockResearchSchema,
    });

    const existing = await this.deps.research.getLatest(run.tenantId, run.applicationPublicId);
    if (existing && existing.status === "completed") {
      await this.commit(usageKey, String(result.usage.estimatedCostCents));
      await this.deps.engine.transition(run.id, "RESEARCH_COMPLETED", {
        message: "Research already completed (idempotent)",
      });
      await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
        stage: "RESEARCH_COMPLETED",
        workflowStage: "RESEARCH_COMPLETED",
        researchConfidence: result.data.overallConfidence,
        status: "evidence",
        nextAction: "Match evidence",
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
        sources: [],
        completedAt: nowIso(),
      });
    } else {
      await this.deps.research.updateRun(run.tenantId, existing.publicId, {
        status: "completed",
        confidence: result.data.overallConfidence,
        findings: result.data.findings,
        completedAt: nowIso(),
      });
    }

    await this.commit(usageKey, String(result.usage.estimatedCostCents));
    await this.deps.engine.transition(run.id, "RESEARCH_COMPLETED", {
      message: "Research completed",
      patch: {
        provider: result.model.provider,
        model: result.model.model,
        promptVersion: prompt.version,
        tokenUsage: {
          input: result.usage.inputTokens,
          output: result.usage.outputTokens,
          total: result.usage.inputTokens + result.usage.outputTokens,
        },
        estimatedCostCents: String(result.usage.estimatedCostCents),
      },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "RESEARCH_COMPLETED",
      workflowStage: "RESEARCH_COMPLETED",
      researchConfidence: result.data.overallConfidence,
      status: "evidence",
      nextAction: "Match evidence",
    });
  }

  private async runEvidenceMatching(run: WorkflowRunRecord) {
    const usageKey = await this.reserve(run, "research", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt("evidence-matching");
    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ applicationPublicId: run.applicationPublicId }),
      schema: mockEvidenceMatchSchema,
    });

    await this.commit(usageKey, String(result.usage.estimatedCostCents));
    await this.deps.engine.transition(run.id, "EVIDENCE_MATCHING_COMPLETED", {
      message: "Evidence matching completed",
      patch: { provider: result.model.provider, model: result.model.model, promptVersion: prompt.version },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "EVIDENCE_MATCHING_COMPLETED",
      workflowStage: "EVIDENCE_MATCHING_COMPLETED",
      evidenceCoverage: result.data.evidenceCoverage,
      status: "resume",
      nextAction: "Generate V0",
    });
  }

  private async runResumeGeneration(run: WorkflowRunRecord, versionNumber: number, triggeredBy: string) {
    const idempotencyKey = `resume:${run.applicationPublicId}:v${versionNumber}:${run.idempotencyKey}`;
    const existingVersion = await this.deps.resumes.findVersionByIdempotency(run.tenantId, idempotencyKey);
    if (existingVersion) {
      const readyStage = `V${versionNumber}_READY` as WorkflowStage;
      await this.deps.engine.transition(run.id, readyStage, {
        message: `V${versionNumber} already exists (idempotent)`,
        outputVersion: String(versionNumber),
      });
      return;
    }

    const usageKey = await this.reserve(run, "resume_generation", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt("resume-generation");
    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ applicationPublicId: run.applicationPublicId, versionNumber }),
      schema: mockResumeSchema,
    });

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

    const version = await this.deps.resumes.appendVersion({
      id: newId("rv"),
      publicId: `rv-v${versionNumber}-${run.applicationPublicId}`,
      tenantId: run.tenantId,
      resumeId: resume.id,
      versionNumber,
      versionLabel: `V${versionNumber}`,
      score: result.data.score,
      scoreBreakdown: result.data.scoreBreakdown,
      notes: result.data.notes,
      triggeredBy,
      sections: result.data.sections,
      idempotencyKey,
      promptVersion: prompt.version,
    });

    await this.deps.resumes.setCurrentVersion(run.tenantId, resume.publicId, version.publicId);
    await this.commit(usageKey, String(result.usage.estimatedCostCents));

    const readyStage = `V${versionNumber}_READY` as WorkflowStage;
    await this.deps.engine.transition(run.id, readyStage, {
      message: `Resume V${versionNumber} ready`,
      outputVersion: String(versionNumber),
      patch: {
        provider: result.model.provider,
        model: result.model.model,
        promptVersion: prompt.version,
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

    const usageKey = await this.reserve(run, "audit", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt(promptId);
    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ applicationPublicId: run.applicationPublicId, reviewsVersion }),
      schema: mockAuditSchema,
    });

    const existingRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
    const already = existingRuns.find((r) => r.lens === result.data.lens);
    if (!already) {
      const audit = await this.deps.audits.createRun({
        id: newId("ar"),
        publicId: newId("arp"),
        tenantId: run.tenantId,
        applicationId: run.applicationId,
        applicationPublicId: run.applicationPublicId,
        lens: result.data.lens,
        label: promptId.replace("-", " ").toUpperCase(),
        reviewsVersion: `V${reviewsVersion}`,
        producesVersion: `V${producesVersion}`,
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

    await this.commit(usageKey, String(result.usage.estimatedCostCents));

    const reviewStage = run.stage.replace("_RUNNING", "_REVIEW") as WorkflowStage;
    await this.deps.engine.transition(run.id, reviewStage, {
      message: `${promptId} ready for review`,
      patch: { promptVersion: prompt.version, provider: result.model.provider, model: result.model.model },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: reviewStage,
      workflowStage: reviewStage,
      status: "auditing",
      nextAction: "Review findings",
    });
  }

  private async runFinalQa(run: WorkflowRunRecord) {
    const usageKey = await this.reserve(run, "audit", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt("final-qa");
    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ applicationPublicId: run.applicationPublicId }),
      schema: mockFinalQaSchema,
    });

    await this.commit(usageKey, String(result.usage.estimatedCostCents));

    if (!result.data.passed) {
      await this.deps.engine.transition(run.id, "FINAL_QA_FAILED", { message: "Final QA failed" });
      throw new AppError("FINAL_QA_FAILED", "Final QA checks failed", 422, result.data.checks);
    }

    await this.deps.engine.transition(run.id, "FINAL_READY", {
      message: "Final QA passed",
      status: "completed",
      patch: { promptVersion: prompt.version },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "FINAL_READY",
      workflowStage: "FINAL_READY",
      status: "ready",
      nextAction: "Export resume",
    });
  }
}
