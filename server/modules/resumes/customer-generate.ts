import { createHash } from "crypto";
import { z } from "zod";
import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { Repositories, ResumeVersionRecord } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";
import { previewHtmlFromDocument } from "../../resumes/document-renderer";
import { buildResumeDocument } from "../../resumes/resume-document";
import { mapInternalStageToCustomer, needsInputForTechQuestions } from "../../resumes/customer-status";
import { computeCandidArcQualityScore } from "../../resumes/quality-score";
import {
  applyTechAnswers,
  attestedEvidenceEntries,
  claimableTechnologies,
  excludedTechnologies,
  hasUnansweredTechQuestions,
  techAnswersFingerprint,
  type TechAnswerKind,
  type TechQuestion,
} from "../../resumes/tech-questions";
import { fetchJobDescriptionFromUrl } from "../../resumes/job-extraction";
import type { ObjectStorage } from "../../storage/types";
import type { DurableWorkflowEngine } from "../../workflows/engine";
import type { WorkflowStage } from "../../domain/types";
import {
  CUSTOMER_DOCUMENT_FAILURE_MESSAGE,
  failStaleDocumentPreparation,
} from "../../workflows/failure-handler";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const customerGenerateInputSchema = z.object({
  jobDescription: z.preprocess(emptyToUndefined, z.string().min(20).max(100_000).optional()),
  jobUrl: z.preprocess(emptyToUndefined, z.string().url().optional()),
  company: z.preprocess(emptyToUndefined, z.string().min(1).max(120).optional()),
  role: z.preprocess(emptyToUndefined, z.string().min(1).max(160).optional()),
  location: z.preprocess(emptyToUndefined, z.string().max(160).optional()),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).refine((input) => input.jobDescription || input.jobUrl, {
  message: "A job description or job URL is required",
});

export const techAnswersInputSchema = z.object({
  answers: z.array(z.object({
    id: z.string().min(1),
    answer: z.enum(["yes_professional", "yes_project", "similar", "no", "not_sure"]),
    evidence: z.string().max(4000).optional(),
  }).superRefine((value, ctx) => {
    if ((value.answer === "yes_professional" || value.answer === "yes_project") && !value.evidence?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Evidence is required for yes answers",
        path: ["evidence"],
      });
    }
  })).max(5),
  skip: z.boolean().optional(),
});

export const refineResumeInputSchema = z.object({
  instruction: z.string().min(3).max(4000),
  quickAction: z.string().max(100).optional(),
});

type GenerateInput = z.infer<typeof customerGenerateInputSchema>;

function contactFromMetadata(metadata?: Record<string, unknown>) {
  return {
    name: typeof metadata?.candidateName === "string" ? metadata.candidateName : undefined,
    email: typeof metadata?.candidateEmail === "string" ? metadata.candidateEmail : undefined,
    phone: typeof metadata?.candidatePhone === "string" ? metadata.candidatePhone : undefined,
    location: typeof metadata?.candidateLocation === "string" ? metadata.candidateLocation : undefined,
    linkedIn: typeof metadata?.candidateLinkedIn === "string" ? metadata.candidateLinkedIn : undefined,
    github: typeof metadata?.candidateGithub === "string" ? metadata.candidateGithub : undefined,
    portfolio: typeof metadata?.candidatePortfolio === "string" ? metadata.candidatePortfolio : undefined,
  };
}

function previewHtml(
  version: ResumeVersionRecord,
  candidateName: string,
  role: string,
  company: string,
  metadata?: Record<string, unknown>,
): string {
  const document = buildResumeDocument({
    sections: version.sections,
    candidateName,
    role,
    company,
    contact: contactFromMetadata(metadata),
  });
  return previewHtmlFromDocument(document);
}

type CustomerFilesMeta = {
  pdfFileId?: string;
  docxFileId?: string;
  pdfStorageKey?: string;
  docxStorageKey?: string;
  pageCount?: number;
};

function hasUnansweredTechQuestionsLocal(questions: TechQuestion[]): boolean {
  return hasUnansweredTechQuestions(questions);
}

async function documentsReady(
  storage: ObjectStorage,
  tenantId: string,
  files: CustomerFilesMeta,
): Promise<{ pdfReady: boolean; docxReady: boolean }> {
  const [pdfReady, docxReady] = await Promise.all([
    files.pdfStorageKey
      ? storage.headObject(tenantId, files.pdfStorageKey).then((meta) => (meta?.size ?? 0) > 0).catch(() => false)
      : false,
    files.docxStorageKey
      ? storage.headObject(tenantId, files.docxStorageKey).then((meta) => (meta?.size ?? 0) > 0).catch(() => false)
      : false,
  ]);
  return { pdfReady, docxReady };
}

export class CustomerGenerateService {
  constructor(
    private readonly repos: Repositories,
    private readonly engine: DurableWorkflowEngine,
    private readonly storage: ObjectStorage,
  ) {}

  private tenant(ctx: AuthContext) {
    const user = requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    requireTenantRole(ctx, ctx.activeTenantId, ["owner", "admin", "member"]);
    return { user, tenantId: ctx.activeTenantId };
  }

  async generate(ctx: AuthContext, input: GenerateInput) {
    const { user, tenantId } = this.tenant(ctx);
    const profile = await this.repos.candidateProfiles.getByUser(tenantId, user.id);
    const ownedEvidence = await this.repos.evidence.list(tenantId, { ownerUserId: user.id });
    if (!ownedEvidence.length) {
      throw new AppError(
        "PROFILE_EVIDENCE_REQUIRED",
        "Add career evidence before generating a tailored resume. Import a resume or add notes during onboarding.",
        422,
      );
    }

    let jobDescription = input.jobDescription;
    if (!jobDescription?.trim() && input.jobUrl) {
      jobDescription = await fetchJobDescriptionFromUrl(input.jobUrl);
    }

    const sourceHash = createHash("sha256")
      .update(`${input.jobUrl ?? ""}\n${jobDescription ?? ""}`)
      .digest("hex");
    const idempotencyKey = `customer:${user.id}:${sourceHash}:${input.idempotencyKey ?? sourceHash}`;
    const existing = await this.repos.workflows.findByIdempotency(tenantId, idempotencyKey);
    if (existing) {
      return { workflowId: existing.publicId, applicationId: existing.applicationPublicId, status: "queued" as const };
    }

    const company = input.company?.trim() || "Target company";
    const role = input.role?.trim() || "Target role";
    const contactSnapshot = {
      candidateName: profile?.fullName || user.name,
      candidateEmail: profile?.email ?? user.email,
      candidatePhone: profile?.phone ?? undefined,
      candidateLocation: profile?.location ?? input.location?.trim(),
      candidateLinkedIn: profile?.linkedIn ?? undefined,
      candidateGithub: profile?.github ?? undefined,
      candidatePortfolio: profile?.portfolio ?? undefined,
      candidateProfileId: profile?.publicId ?? undefined,
    };
    const app = await this.repos.applications.create({
      id: newId("app"),
      publicId: `app-resume-${Date.now().toString(36)}-${newId("r").slice(-6)}`,
      tenantId,
      company,
      companyMark: company.slice(0, 2).toUpperCase(),
      role,
      location: input.location?.trim() || profile?.location || "Remote",
      employmentType: "Full-time",
      status: "researching",
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      resumeScore: 0,
      evidenceCoverage: 0,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 0,
      archived: false,
      roleFamily: "General",
      nextAction: "Creating tailored resume",
      ownerUserId: user.id,
      candidateProfileId: profile?.id ?? null,
      metadata: {
        customerFacing: true,
        autoAdvanceAudits: true,
        ...contactSnapshot,
        jobDescription,
        jobUrl: input.jobUrl,
        sourceHash,
        idempotencyKey: input.idempotencyKey,
        techQuestions: [],
        customerFinalVersions: [],
      },
    });
    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey,
      message: "Customer resume generation queued",
      payload: { customerFacing: true, autoAdvanceAudits: true, cycleBase: 0 },
    });
    return { workflowId: workflow.publicId, applicationId: app.publicId, status: "queued" as const };
  }

  async getCustomerWorkflow(ctx: AuthContext, workflowId: string) {
    const { tenantId, user } = this.tenant(ctx);
    const requested = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!requested) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, requested.applicationPublicId);
    if (!app || app.metadata?.customerFacing !== true) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    if (app.ownerUserId && app.ownerUserId !== user.id) {
      throw new AppError("FORBIDDEN_OWNERSHIP", "You do not own this resume workflow", 403);
    }
    const runs = await this.repos.workflows.listByApplication(tenantId, app.publicId);
    const latestRun = runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? requested;
    let currentApp = app;
    const files = (currentApp.metadata?.customerFiles ?? {}) as CustomerFilesMeta;
    const { pdfReady, docxReady } = await documentsReady(this.storage, tenantId, files);
    const documentsAreReady = pdfReady && docxReady;

    if (
      currentApp.workflowStage === "FINAL_READY" &&
      !documentsAreReady &&
      currentApp.metadata?.documentRenderFailed !== true
    ) {
      const timedOut = await failStaleDocumentPreparation(this.repos, this.engine, {
        tenantId,
        applicationPublicId: currentApp.publicId,
        workflowPublicId: latestRun.publicId,
        startedAt: latestRun.updatedAt ?? latestRun.startedAt ?? latestRun.createdAt,
      });
      if (timedOut) {
        currentApp = (await this.repos.applications.getByPublicId(tenantId, currentApp.publicId)) ?? currentApp;
      }
    }

    const questions = (currentApp.metadata?.techQuestions ?? []) as TechQuestion[];
    const mapped = mapInternalStageToCustomer(currentApp.workflowStage, {
      failed:
        latestRun.status === "failed" ||
        currentApp.workflowStage === "FINAL_QA_FAILED" ||
        currentApp.workflowStage === "FAILED" ||
        latestRun.stage === "FINAL_QA_FAILED" ||
        latestRun.stage === "FAILED" ||
        currentApp.metadata?.documentRenderFailed === true ||
        currentApp.status === "failed",
      documentsReady: documentsAreReady,
      startedAt: latestRun.startedAt ?? latestRun.createdAt,
      needsInput:
        needsInputForTechQuestions(currentApp.workflowStage, questions) ||
        currentApp.workflowStage === "RESEARCH_REVIEW_REQUIRED",
      needsInputMessage:
        currentApp.workflowStage === "RESEARCH_REVIEW_REQUIRED"
          ? "Please confirm the company and role details."
          : "Confirm a few technologies from the job description to improve accuracy.",
    });
    const response: Record<string, unknown> = {
      workflowId: requested.publicId,
      applicationId: currentApp.publicId,
      status: mapped.status,
      message: mapped.message,
      pipelineStage: mapped.pipelineStage,
      pipelineLabel: mapped.pipelineLabel,
      elapsedMs: mapped.elapsedMs,
      downloads: { pdfReady, docxReady },
    };
    // Optional tech confirmation only while generation is waiting on input — hide after advance.
    if (mapped.status === "needs_input" && questions.length) {
      response.techQuestions = questions.filter((question) => question.evidenceStatus === "unanswered" || !question.evidenceStatus);
    }

    if (mapped.status === "completed") {
      const persistedQuality = currentApp.metadata?.qualityReport as Record<string, unknown> | undefined;
      const resume = await this.repos.resumes.getByApplication(tenantId, currentApp.publicId);
      const allVersions = resume ? await this.repos.resumes.listVersions(tenantId, resume.publicId) : [];
      const finalIds = (currentApp.metadata?.customerFinalVersions ?? []) as string[];
      const finalVersions = finalIds.map((id) => allVersions.find((version) => version.publicId === id)).filter(Boolean) as ResumeVersionRecord[];
      const current = finalVersions.at(-1) ?? allVersions.at(-1);
      if (current) {
        const customerNumber = Math.max(1, finalVersions.findIndex((version) => version.publicId === current.publicId) + 1);
        const breakdown = (current.scoreBreakdown ?? {}) as Record<string, number>;
        const quality = computeCandidArcQualityScore({
          sections: current.sections as Array<Record<string, unknown>>,
          contact: {
            email: typeof currentApp.metadata?.candidateEmail === "string" ? currentApp.metadata.candidateEmail : undefined,
            phone: typeof currentApp.metadata?.candidatePhone === "string" ? currentApp.metadata.candidatePhone : undefined,
            location: currentApp.location,
            linkedIn: typeof currentApp.metadata?.candidateLinkedIn === "string" ? currentApp.metadata.candidateLinkedIn : undefined,
          },
          jobRequirements: Array.isArray(currentApp.metadata?.jobRequirements)
            ? (currentApp.metadata.jobRequirements as unknown[]).filter((item): item is string => typeof item === "string")
            : [],
          knownTechnologies: Array.isArray(currentApp.metadata?.knownTechnologies)
            ? (currentApp.metadata.knownTechnologies as unknown[]).filter((item): item is string => typeof item === "string")
            : [],
          preferredLength: "one-page",
          aiRoleAlignment: breakdown.jobAlignment ?? current.score,
          aiAtsReadability: breakdown.atsCompatibility,
        });
        response.resume = {
          versionId: current.publicId,
          versionLabel: `Version ${customerNumber}`,
          previewHtml: previewHtml(
            current,
            typeof currentApp.metadata?.candidateName === "string" ? currentApp.metadata.candidateName : "Candidate",
            currentApp.role,
            currentApp.company,
            currentApp.metadata,
          ),
          sections: current.sections,
          createdAt: current.createdAt,
          role: currentApp.role,
          company: currentApp.company,
          candidateName: typeof currentApp.metadata?.candidateName === "string" ? currentApp.metadata.candidateName : "Candidate",
        };
        response.versions = finalVersions.map((version, index) => ({
          id: version.publicId,
          label: `Version ${index + 1}`,
          createdAt: version.createdAt,
        }));
        response.qualityReport = persistedQuality ?? {
          name: quality.name,
          summary: quality.summary,
          score: quality.score,
          roleAlignment: quality.roleAlignment,
          atsReadability: quality.atsReadability,
          verifiedClaims: quality.verifiedClaims,
          researchSourcesUsed: typeof currentApp.metadata?.researchSourceCount === "number" ? currentApp.metadata.researchSourceCount : undefined,
          remainingSkillGaps: quality.remainingSkillGaps ?? [],
          passed: quality.passed,
          missing: quality.missing,
          verifiedConclusions: quality.verifiedConclusions,
          aiEstimates: quality.aiEstimates,
          nextSteps: quality.nextSteps,
        };
      }
      if (currentApp.metadata?.enhancementAvailable === true) response.enhancementAvailable = true;
    }
    if (mapped.status === "failed") {
      response.error =
        typeof currentApp.metadata?.customerError === "string"
          ? currentApp.metadata.customerError
          : currentApp.metadata?.documentRenderFailed
            ? CUSTOMER_DOCUMENT_FAILURE_MESSAGE
            : "We couldn’t finish this resume. Your job details are saved; please retry.";
    }
    return response;
  }

  async retry(ctx: AuthContext, workflowId: string) {
    const { tenantId, user } = this.tenant(ctx);
    const run = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, run.applicationPublicId);
    if (!app || app.metadata?.customerFacing !== true) {
      throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    }
    if (app.ownerUserId && app.ownerUserId !== user.id) {
      throw new AppError("FORBIDDEN_OWNERSHIP", "You do not own this resume workflow", 403);
    }
    const retryable =
      run.status === "failed" ||
      run.stage === "FAILED" ||
      run.stage === "FINAL_QA_FAILED" ||
      app.workflowStage === "FINAL_QA_FAILED" ||
      app.workflowStage === "FAILED" ||
      app.status === "failed" ||
      app.metadata?.documentRenderFailed === true;
    if (!retryable) {
      throw new AppError("WORKFLOW_NOT_RETRYABLE", "Only failed workflows can be retried", 409);
    }

    const failedAtStage =
      typeof run.payload.failedAtStage === "string"
        ? run.payload.failedAtStage
        : typeof app.metadata?.failedAtStage === "string"
          ? app.metadata.failedAtStage
        : run.stage === "FINAL_QA_FAILED" || app.workflowStage === "FINAL_QA_FAILED"
          ? "FINAL_QA_RUNNING"
          : app.metadata?.documentRenderFailed
            ? "FINAL_QA_RUNNING"
          : "RESEARCH_QUEUED";
    const resumeStage = failedAtStage as WorkflowStage;
    const status = resumeStage.endsWith("_QUEUED") ? "queued" : "running";

    const clearedPayload: Record<string, unknown> = {
      ...run.payload,
      lastRetryAt: new Date().toISOString(),
      failedAtStage: resumeStage,
      documentRenderFailed: undefined,
    };
    for (const key of Object.keys(clearedPayload)) {
      if (key.startsWith("claimed:")) delete clearedPayload[key];
    }

    await this.engine.transition(run.id, resumeStage, {
      status,
      message: "Customer retry from last safe stage",
      patch: {
        attempt: 1,
        errorClass: undefined,
        completedAt: undefined,
        payload: clearedPayload,
      },
    });
    await this.repos.applications.update(tenantId, app.publicId, {
      stage: resumeStage,
      workflowStage: resumeStage,
      status: resumeStage.startsWith("RESEARCH") ? "researching" : resumeStage.includes("EVIDENCE") ? "evidence" : "resume",
      nextAction: "Retrying resume generation",
      metadata: {
        ...app.metadata,
        customerFiles: undefined,
        documentRenderFailed: undefined,
        customerError: undefined,
        documentRenderErrorClass: undefined,
        documentRenderFailedAt: undefined,
        failedAtStage: undefined,
      },
    });

    return { workflowId: run.publicId, applicationId: app.publicId, status: "queued" as const };
  }

  async submitTechAnswers(
    ctx: AuthContext,
    workflowId: string,
    answers: Array<{ id: string; answer: TechAnswerKind; evidence?: string }>,
    opts: { skip?: boolean } = {},
  ) {
    const { tenantId, user } = this.tenant(ctx);
    const run = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, run.applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Resume application not found", 404);
    if (app.ownerUserId && app.ownerUserId !== user.id) {
      throw new AppError("FORBIDDEN_OWNERSHIP", "You do not own this resume workflow", 403);
    }

    const existingQuestions = (app.metadata?.techQuestions ?? []) as TechQuestion[];
    const fingerprint = techAnswersFingerprint(answers);
    const priorFingerprint = typeof app.metadata?.techAnswersFingerprint === "string"
      ? app.metadata.techAnswersFingerprint
      : null;

    if (priorFingerprint && priorFingerprint === fingerprint && !opts.skip) {
      await this.resumePausedWorkflow(run, app, existingQuestions);
      return { accepted: true, duplicate: true, enhancementAvailable: Boolean(app.metadata?.enhancementAvailable) };
    }

    const questions = opts.skip || !answers.length
      ? existingQuestions.map((question) =>
          question.answer
            ? question
            : { ...question, answer: "not_sure" as const, evidenceStatus: "rejected" as const },
        )
      : applyTechAnswers(existingQuestions, answers);

    const excluded = excludedTechnologies(questions);
    const attested = attestedEvidenceEntries(questions);
    for (const entry of attested) {
      const evidenceKey = `tech-attest:${app.publicId}:${entry.technology.toLowerCase()}`;
      const existingEvidence = await this.repos.evidence.list(tenantId, { ownerUserId: user.id });
      if (!existingEvidence.some((item) => item.payload?.techConfirmationKey === evidenceKey)) {
        await this.repos.evidence.create({
          id: newId("ev"),
          publicId: newId("evp"),
          tenantId,
          ownerUserId: user.id,
          candidateProfileId: typeof app.metadata?.candidateProfileId === "string" ? app.metadata.candidateProfileId : null,
          title: `${entry.technology} experience (self-attested)`,
          organization: "Self-attested",
          situation: entry.evidence,
          task: `Confirm ${entry.technology} experience for ${app.role}`,
          actions: [entry.evidence],
          result: "Candidate attested during technology confirmation",
          technologies: [entry.technology],
          confidence: "medium",
          verificationStatus: "user_attested",
          privacyLevel: "share-safe",
          excludedFromApplicationIds: [],
          matchedApplicationIds: [app.publicId],
          payload: { techConfirmationKey: evidenceKey, source: "tech_confirmation" },
        });
      }
    }

    const isComplete = app.workflowStage === "FINAL_READY" && Boolean((app.metadata?.customerFiles as object | undefined));
    const updatedApp = await this.repos.applications.update(tenantId, app.publicId, {
      metadata: {
        ...app.metadata,
        techQuestions: questions,
        excludedTechnologies: excluded,
        knownTechnologies: claimableTechnologies(questions),
        techAnswersFingerprint: fingerprint,
        techQuestionsSkipped: opts.skip === true,
        ...(isComplete ? { enhancementAvailable: true } : {}),
      },
    });

    await this.resumePausedWorkflow(run, updatedApp, questions);

    return { accepted: true, enhancementAvailable: isComplete };
  }

  private async resumePausedWorkflow(
    run: Awaited<ReturnType<Repositories["workflows"]["getByPublicId"]>>,
    app: NonNullable<Awaited<ReturnType<Repositories["applications"]["getByPublicId"]>>>,
    questions: TechQuestion[],
  ) {
    if (!run) return;
    if (app.workflowStage === "RESEARCH_REVIEW_REQUIRED") {
      await this.engine.transition(run.id, "RESEARCH_RUNNING", {
        status: "running",
        message: "Resuming research after identity confirmation",
      });
      await this.repos.applications.update(run.tenantId, app.publicId, {
        stage: "RESEARCH_RUNNING",
        workflowStage: "RESEARCH_RUNNING",
        status: "researching",
        nextAction: "Continue research",
      });
      return;
    }

    if (
      app.workflowStage === "RESEARCH_COMPLETED" &&
      run.status === "waiting_review" &&
      !hasUnansweredTechQuestionsLocal(questions)
    ) {
      await this.engine.transition(run.id, "EVIDENCE_MATCHING_RUNNING", {
        status: "running",
        message: "Resuming evidence matching after technology confirmation",
      });
      await this.repos.applications.update(run.tenantId, app.publicId, {
        stage: "EVIDENCE_MATCHING_RUNNING",
        workflowStage: "EVIDENCE_MATCHING_RUNNING",
        status: "evidence",
        nextAction: "Match evidence",
      });
    }
  }

  async refine(ctx: AuthContext, workflowId: string, input: { instruction: string; quickAction?: string }) {
    const { tenantId, user } = this.tenant(ctx);
    const original = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!original) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, original.applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Resume application not found", 404);
    if (app.ownerUserId && app.ownerUserId !== user.id) {
      throw new AppError("FORBIDDEN_OWNERSHIP", "You do not own this resume workflow", 403);
    }
    const resume = await this.repos.resumes.getByApplication(tenantId, app.publicId);
    const versions = resume ? await this.repos.resumes.listVersions(tenantId, resume.publicId) : [];
    const cycleBase = (versions.at(-1)?.versionNumber ?? -1) + 1;
    const workflow = await this.engine.start({
      tenantId,
      applicationId: app.id,
      applicationPublicId: app.publicId,
      stage: "RESEARCH_QUEUED",
      idempotencyKey: `customer-refine:${app.publicId}:${createHash("sha256").update(`${input.quickAction ?? ""}:${input.instruction}`).digest("hex")}:${cycleBase}`,
      message: "Resume refinement queued",
      payload: { customerFacing: true, autoAdvanceAudits: true, cycleBase, refinementInstruction: input.instruction, quickAction: input.quickAction },
    });
    await this.repos.applications.update(tenantId, app.publicId, {
      stage: "RESEARCH_QUEUED",
      workflowStage: "RESEARCH_QUEUED",
      status: "researching",
      metadata: { ...app.metadata, customerFiles: undefined, refinementInstruction: input.instruction, enhancementAvailable: false },
    });
    return { workflowId: workflow.publicId, applicationId: app.publicId, status: "queued" as const };
  }

  async createEnhancedVersion(ctx: AuthContext, workflowId: string) {
    return this.refine(ctx, workflowId, {
      instruction: "Create an enhanced version using newly confirmed technology experience. Keep prior evidence intact and write attested technologies conservatively.",
      quickAction: "enhance_with_evidence",
    });
  }

  async getDownload(ctx: AuthContext, workflowId: string, format: "pdf" | "docx") {
    const { tenantId, user } = this.tenant(ctx);
    const run = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, run.applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Resume application not found", 404);
    if (app.ownerUserId && app.ownerUserId !== user.id) {
      throw new AppError("FORBIDDEN_OWNERSHIP", "You do not own this resume workflow", 403);
    }
    const files = app.metadata?.customerFiles as CustomerFilesMeta | undefined;
    const storageKey = format === "pdf" ? files?.pdfStorageKey : files?.docxStorageKey;
    if (!storageKey) throw new AppError("DOCUMENT_NOT_READY", "That document is not ready yet", 409);
    const object = await this.storage.getObject(tenantId, storageKey);
    if (!object?.body.length) throw new AppError("DOCUMENT_NOT_READY", "That document is not ready yet", 409);
    return {
      body: object.body,
      contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${app.role ?? "tailored-resume"}.${format}`,
    };
  }
}
