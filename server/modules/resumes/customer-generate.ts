import { createHash } from "crypto";
import { promises as fs } from "fs";
import { z } from "zod";
import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { Repositories, ResumeVersionRecord } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";
import { mapInternalStageToCustomer } from "../../resumes/customer-status";
import {
  applyTechAnswers,
  type TechAnswerKind,
  type TechQuestion,
} from "../../resumes/tech-questions";
import type { DurableWorkflowEngine } from "../../workflows/engine";

export const customerGenerateInputSchema = z.object({
  jobDescription: z.string().min(20).max(100_000).optional(),
  jobUrl: z.string().url().optional(),
  company: z.string().min(1).max(120).optional(),
  role: z.string().min(1).max(160).optional(),
  location: z.string().max(160).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
}).refine((input) => input.jobDescription || input.jobUrl, {
  message: "A job description or job URL is required",
});

export const techAnswersInputSchema = z.object({
  answers: z.array(z.object({
    id: z.string().min(1),
    answer: z.enum(["yes_professional", "yes_project", "similar", "no", "not_sure"]),
    evidence: z.string().max(4000).optional(),
  })).max(5),
});

export const refineResumeInputSchema = z.object({
  instruction: z.string().min(3).max(4000),
  quickAction: z.string().max(100).optional(),
});

type GenerateInput = z.infer<typeof customerGenerateInputSchema>;

function previewHtml(version: ResumeVersionRecord): string {
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return version.sections.map((section) => `<section><pre>${escape(JSON.stringify(section, null, 2))}</pre></section>`).join("");
}

export class CustomerGenerateService {
  constructor(
    private readonly repos: Repositories,
    private readonly engine: DurableWorkflowEngine,
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
    const sourceHash = createHash("sha256")
      .update(`${input.jobUrl ?? ""}\n${input.jobDescription ?? ""}`)
      .digest("hex");
    const idempotencyKey = `customer:${user.id}:${sourceHash}:${input.idempotencyKey ?? sourceHash}`;
    const existing = await this.repos.workflows.findByIdempotency(tenantId, idempotencyKey);
    if (existing) {
      return { workflowId: existing.publicId, applicationId: existing.applicationPublicId, status: "queued" as const };
    }

    const company = input.company?.trim() || "Target company";
    const role = input.role?.trim() || "Target role";
    const app = await this.repos.applications.create({
      id: newId("app"),
      publicId: `app-resume-${Date.now().toString(36)}-${newId("r").slice(-6)}`,
      tenantId,
      company,
      companyMark: company.slice(0, 2).toUpperCase(),
      role,
      location: input.location?.trim() || "Remote",
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
      metadata: {
        customerFacing: true,
        autoAdvanceAudits: true,
        candidateName: user.name,
        jobDescription: input.jobDescription,
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
    const { tenantId } = this.tenant(ctx);
    const requested = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!requested) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, requested.applicationPublicId);
    if (!app || app.metadata?.customerFacing !== true) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const runs = await this.repos.workflows.listByApplication(tenantId, app.publicId);
    const latestRun = runs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? requested;
    const files = (app.metadata?.customerFiles ?? {}) as { pdfPath?: string; docxPath?: string; pdfFileId?: string; docxFileId?: string };
    const [pdfReady, docxReady] = await Promise.all([
      files.pdfPath ? fs.stat(files.pdfPath).then((stat) => stat.size > 0).catch(() => false) : false,
      files.docxPath ? fs.stat(files.docxPath).then((stat) => stat.size > 0).catch(() => false) : false,
    ]);
    const documentsReady = pdfReady && docxReady;
    const mapped = mapInternalStageToCustomer(app.workflowStage, {
      failed: latestRun.status === "failed",
      documentsReady,
    });
    const response: Record<string, unknown> = {
      workflowId: requested.publicId,
      applicationId: app.publicId,
      status: mapped.status,
      message: mapped.message,
      downloads: { pdfReady, docxReady },
    };
    const questions = (app.metadata?.techQuestions ?? []) as TechQuestion[];
    if (mapped.status !== "completed" && mapped.status !== "failed" && questions.length) response.techQuestions = questions;

    if (mapped.status === "completed") {
      const resume = await this.repos.resumes.getByApplication(tenantId, app.publicId);
      const allVersions = resume ? await this.repos.resumes.listVersions(tenantId, resume.publicId) : [];
      const finalIds = (app.metadata?.customerFinalVersions ?? []) as string[];
      const finalVersions = finalIds.map((id) => allVersions.find((version) => version.publicId === id)).filter(Boolean) as ResumeVersionRecord[];
      const current = finalVersions.at(-1) ?? allVersions.at(-1);
      if (current) {
        const customerNumber = Math.max(1, finalVersions.findIndex((version) => version.publicId === current.publicId) + 1);
        const breakdown = (current.scoreBreakdown ?? {}) as Record<string, number>;
        response.resume = {
          versionId: current.publicId,
          versionLabel: `Version ${customerNumber}`,
          previewHtml: previewHtml(current),
          sections: current.sections,
          createdAt: current.createdAt,
        };
        response.versions = finalVersions.map((version, index) => ({
          id: version.publicId,
          label: `Version ${index + 1}`,
          createdAt: version.createdAt,
        }));
        response.qualityReport = {
          summary: "Your resume passed evidence, readability, and formatting checks.",
          score: current.score,
          roleAlignment: breakdown.jobAlignment ?? current.score,
          atsReadability: breakdown.atsCompatibility,
          verifiedClaims: current.sections.reduce((count: number, section) => {
            const bullets = Array.isArray((section as { bullets?: unknown[] }).bullets) ? (section as { bullets: unknown[] }).bullets : [];
            return count + bullets.filter((bullet) => {
              const ids = (bullet as { evidenceIds?: unknown }).evidenceIds;
              return Array.isArray(ids) && ids.length > 0;
            }).length;
          }, 0),
          researchSourcesUsed: typeof app.metadata?.researchSourceCount === "number" ? app.metadata.researchSourceCount : undefined,
          remainingSkillGaps: Array.isArray(app.metadata?.remainingSkillGaps)
            ? (app.metadata.remainingSkillGaps as unknown[]).filter((item): item is string => typeof item === "string").slice(0, 5)
            : [],
        };
      }
      if (app.metadata?.enhancementAvailable === true) response.enhancementAvailable = true;
    }
    if (mapped.status === "failed") response.error = "We couldn’t finish this resume. Your job details are saved; please retry.";
    return response;
  }

  async submitTechAnswers(
    ctx: AuthContext,
    workflowId: string,
    answers: Array<{ id: string; answer: TechAnswerKind; evidence?: string }>,
  ) {
    const { tenantId } = this.tenant(ctx);
    const run = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, run.applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Resume application not found", 404);
    const questions = applyTechAnswers((app.metadata?.techQuestions ?? []) as TechQuestion[], answers);
    const isComplete = app.workflowStage === "FINAL_READY" && Boolean((app.metadata?.customerFiles as object | undefined));
    await this.repos.applications.update(tenantId, app.publicId, {
      metadata: { ...app.metadata, techQuestions: questions, ...(isComplete ? { enhancementAvailable: true } : {}) },
    });
    return { accepted: true, enhancementAvailable: isComplete };
  }

  async refine(ctx: AuthContext, workflowId: string, input: { instruction: string; quickAction?: string }) {
    const { tenantId } = this.tenant(ctx);
    const original = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!original) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, original.applicationPublicId);
    if (!app) throw new AppError("APPLICATION_NOT_FOUND", "Resume application not found", 404);
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
    const { tenantId } = this.tenant(ctx);
    const run = await this.repos.workflows.getByPublicId(tenantId, workflowId);
    if (!run) throw new AppError("WORKFLOW_NOT_FOUND", "Resume workflow not found", 404);
    const app = await this.repos.applications.getByPublicId(tenantId, run.applicationPublicId);
    const files = app?.metadata?.customerFiles as { pdfPath?: string; docxPath?: string } | undefined;
    const filePath = format === "pdf" ? files?.pdfPath : files?.docxPath;
    if (!filePath) throw new AppError("DOCUMENT_NOT_READY", "That document is not ready yet", 409);
    const body = await fs.readFile(filePath).catch(() => null);
    if (!body?.length) throw new AppError("DOCUMENT_NOT_READY", "That document is not ready yet", 409);
    return {
      body,
      contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      filename: `${app?.role ?? "tailored-resume"}.${format}`,
    };
  }
}
