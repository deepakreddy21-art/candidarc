import { getGenerationProvider } from "../ai";
import { getPrompt } from "../ai/prompt-registry";
import {
  mockAuditSchema,
  mockEvidenceMatchSchema,
  mockResearchSchema,
  mockResumeSchema,
} from "../ai/mock-provider";
import type {
  ApplicationRepository,
  AuditRepository,
  EvidenceRepository,
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
import { runDeterministicFinalQa } from "./final-qa";

export type ResumePipelineDeps = {
  engine: DurableWorkflowEngine;
  applications: ApplicationRepository;
  research: ResearchRepository;
  resumes: ResumeRepository;
  audits: AuditRepository;
  usage: UsageRepository;
  evidence: EvidenceRepository;
  store: Repositories["store"];
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
      evidence: repos.evidence,
      store: repos.store,
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

  private async recordProviderUsage(
    run: WorkflowRunRecord,
    key: string,
    result: { model: { provider: string; model: string }; prompt: { version: string }; usage: { inputTokens: number; outputTokens: number; estimatedCostCents: number }; latencyMs: number },
  ) {
    await this.deps.usage.append({
      tenantId: run.tenantId,
      kind: "input_tokens",
      units: String(result.usage.inputTokens + result.usage.outputTokens),
      costCents: String(result.usage.estimatedCostCents),
      workflowRunId: run.id,
      idempotencyKey: `${key}:provider-usage`,
      status: "committed",
      metadata: {
        provider: result.model.provider,
        model: result.model.model,
        promptVersion: result.prompt.version,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        latencyMs: result.latencyMs,
        estimatedCostCents: result.usage.estimatedCostCents,
      },
    });
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
    await this.recordProviderUsage(run, usageKey, result);

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
      stage: "EVIDENCE_MATCHING_RUNNING",
      workflowStage: "EVIDENCE_MATCHING_RUNNING",
      researchConfidence: result.data.overallConfidence,
      status: "evidence",
      nextAction: "Match evidence",
    });
    await this.deps.engine.transition(run.id, "EVIDENCE_MATCHING_RUNNING", {
      message: "Evidence matching started automatically",
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
    await this.recordProviderUsage(run, usageKey, result);

    await this.commit(usageKey, String(result.usage.estimatedCostCents));
    await this.deps.engine.transition(run.id, "EVIDENCE_MATCHING_COMPLETED", {
      message: "Evidence matching completed",
      patch: { provider: result.model.provider, model: result.model.model, promptVersion: prompt.version },
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
    const idempotencyKey = `resume:${run.applicationPublicId}:v${versionNumber}:${run.idempotencyKey}`;
    const existingVersion = await this.deps.resumes.findVersionByIdempotency(run.tenantId, idempotencyKey);
    if (existingVersion) {
      const readyStage = `V${versionNumber}_READY` as WorkflowStage;
      await this.deps.engine.transition(run.id, readyStage, {
        message: `V${versionNumber} already exists (idempotent)`,
        outputVersion: String(versionNumber),
      });
      const nextRunning = [
        "HR_AUDIT_1_RUNNING",
        "EM_AUDIT_1_RUNNING",
        "HR_AUDIT_2_RUNNING",
        "EM_AUDIT_2_RUNNING",
        "FINAL_QA_RUNNING",
      ][versionNumber] as WorkflowStage;
      await this.deps.engine.transition(run.id, nextRunning, { message: "Continuing pipeline automatically" });
      return;
    }

    const usageKey = await this.reserve(run, "resume_generation", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt("resume-generation");
    const application = await this.deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
    const research = await this.deps.research.getLatest(run.tenantId, run.applicationPublicId);
    const evidence = await this.deps.evidence.list(run.tenantId);
    const currentResume = await this.deps.resumes.getByApplication(run.tenantId, run.applicationPublicId);
    const previousVersions = currentResume ? await this.deps.resumes.listVersions(run.tenantId, currentResume.publicId) : [];
    const previousVersion = previousVersions.find((version) => version.versionNumber === versionNumber - 1);
    const auditRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
    const previousAudit = auditRuns.at(-1);
    const auditFindings = previousAudit ? await this.deps.audits.listFindings(run.tenantId, previousAudit.publicId) : [];
    const mistakeMemory = "mistakeMemoryRules" in this.deps.store
      ? [...((this.deps.store as Repositories["store"] & { mistakeMemoryRules: Map<string, { tenantId: string; applicationId: string; status: string }> }).mistakeMemoryRules?.values?.() ?? [])]
          .filter((rule) => rule.tenantId === run.tenantId && rule.applicationId === run.applicationId && rule.status === "active")
      : [];
    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({
        applicationPublicId: run.applicationPublicId,
        versionNumber,
        jobDescription: application?.metadata?.jobDescription,
        application: application?.metadata,
        researchFindings: research?.findings ?? [],
        evidence: evidence.map((item) => ({ id: item.publicId, ...item.payload })),
        previousVersion,
        auditFindings,
        mistakeMemory,
      }),
      schema: mockResumeSchema,
      metadata: { allowedEvidenceIds: evidence.map((item) => item.publicId) },
    });
    await this.recordProviderUsage(run, usageKey, result);

    const actionable = auditFindings.filter((finding) => finding.status === "accepted" || finding.status === "edited");
    if (versionNumber > 0 && previousVersion && actionable.length === 0) {
      result.data.sections = previousVersion.sections as typeof result.data.sections;
    } else if (actionable.length) {
      result.data.sections = [
        ...result.data.sections,
        { type: "audit-decisions", title: "Applied audit decisions", content: actionable.map((finding) => finding.editedText ?? finding.suggestedText) },
      ];
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

    const nextRunning = [
      "HR_AUDIT_1_RUNNING",
      "EM_AUDIT_1_RUNNING",
      "HR_AUDIT_2_RUNNING",
      "EM_AUDIT_2_RUNNING",
      "FINAL_QA_RUNNING",
    ][versionNumber] as WorkflowStage;
    await this.deps.engine.transition(run.id, nextRunning, {
      message: versionNumber >= 4 ? "Final QA started automatically" : "Next audit started automatically",
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

    const usageKey = await this.reserve(run, "audit", 1);
    const provider = getGenerationProvider();
    const prompt = getPrompt(promptId);
    const result = await provider.generateStructured({
      prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
      system: prompt.system,
      user: JSON.stringify({ applicationPublicId: run.applicationPublicId, reviewsVersion }),
      schema: mockAuditSchema,
    });
    await this.recordProviderUsage(run, usageKey, result);

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
    const resume = await this.deps.resumes.getByApplication(run.tenantId, run.applicationPublicId);
    if (!resume) throw new AppError("RESUME_NOT_FOUND", "Resume required for Final QA", 422);
    const versions = await this.deps.resumes.listVersions(run.tenantId, resume.publicId);
    const latest = versions.at(-1);
    if (!latest) throw new AppError("RESUME_VERSION_NOT_FOUND", "Resume version required for Final QA", 422);
    const auditRuns = await this.deps.audits.listRuns(run.tenantId, run.applicationPublicId);
    const findings = (await Promise.all(auditRuns.map((audit) => this.deps.audits.listFindings(run.tenantId, audit.publicId)))).flat();
    const result = runDeterministicFinalQa({
      sections: latest.sections,
      unresolvedCriticalFindings: findings.filter((finding) => finding.severity === "critical" && finding.status === "open").length,
    });

    if (!result.passed) {
      await this.deps.engine.transition(run.id, "FINAL_QA_FAILED", { message: "Final QA failed" });
      throw new AppError("FINAL_QA_FAILED", "Final QA checks failed", 422, result.checks);
    }

    await this.deps.engine.transition(run.id, "FINAL_READY", {
      message: "Final QA passed",
      status: "completed",
      patch: { payload: { ...run.payload, finalQa: result } },
    });
    await this.deps.applications.update(run.tenantId, run.applicationPublicId, {
      stage: "FINAL_READY",
      workflowStage: "FINAL_READY",
      status: "ready",
      nextAction: "Export resume",
    });
  }
}
