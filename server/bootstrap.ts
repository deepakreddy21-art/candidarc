import { getEnv, isFeatureCopilotEnabled, isFeatureRadarEnabled } from "./config/env";
import {
  type ApplicationRecord,
  type AuditFindingRecord,
  type AuditRunRecord,
  type CandidateProfileRecord,
  type EvidenceRecord,
  type Repositories,
  type ResumeRecord,
  type ResumeVersionRecord,
  type WorkflowEventRecord,
  type WorkflowRunRecord,
  newId,
} from "./database/repositories";
import { seedDemoAppsIntoMemory, getDemoExtras } from "./database/seed-demo-apps";
import { ApplicationsService } from "./modules/applications/service";
import { ResearchService } from "./modules/research/service";
import { EvidenceService } from "./modules/evidence/service";
import { ResumesService } from "./modules/resumes/service";
import { AuditsService } from "./modules/audits/service";
import { WorkflowsService } from "./modules/workflows/service";
import { UsageService } from "./modules/usage/service";
import { FilesService } from "./modules/files/service";
import { getStorage } from "./storage";
import { DbWorkflowEngine } from "./workflows/engine";
import { getQueueAdapter, type QueueAdapter } from "./workflows/queues";
import { ResumePipeline } from "./workflows/resume-pipeline";
import { handleWorkflowJobExhausted, type WorkflowJobPayload } from "./workflows/failure-handler";
import { stageMatchesJobClaim } from "./workflows/stages";
import { logger } from "./observability/logger";
import type { WorkflowStage as BackendStage } from "./domain/types";
import type {
  Application,
  ApplicationStatus,
  Audit,
  AuditFinding,
  CandidateProfile,
  EvidenceItem,
  Resume,
  WorkflowStage,
} from "@/types/domain";
import { ProfileService } from "./modules/profile/service";
import { ResumeImportService } from "./modules/resumes/import-service";
import { seedDemoCatalog } from "./radar/catalog";
import { RadarService } from "./radar/service";
import { registerRadarQueueHandlers } from "./radar/queues";
import { CopilotService } from "./copilot/service";
import { CustomerGenerateService } from "./modules/resumes/customer-generate";
import { renderPdfAndDocx } from "./resumes/document-renderer";

export type RuntimeServices = {
  applications: ApplicationsService;
  research: ResearchService;
  evidence: EvidenceService;
  resumes: ResumesService;
  audits: AuditsService;
  workflows: WorkflowsService;
  usage: UsageService;
  files: FilesService;
  profile: ProfileService;
  resumeImport: ResumeImportService;
  radar: RadarService | null;
  copilot: CopilotService | null;
  customerResumes: CustomerGenerateService;
};

export type Runtime = {
  mode: "memory" | "postgres";
  repos: Repositories;
  queue: QueueAdapter;
  engine: DbWorkflowEngine;
  pipeline: ResumePipeline;
  services: RuntimeServices;
  store: Repositories["store"];
};

let runtimePromise: Promise<Runtime> | null = null;
let queueDrainStarted = false;

const WORKFLOW_QUEUES = [
  "research",
  "evidence-matching",
  "resume-generation",
  "resume-audit",
] as const;

const BACKEND_TO_UI_STAGE: Record<string, WorkflowStage> = {
  APPLICATION_CREATED: "research",
  RESEARCH_QUEUED: "research",
  RESEARCH_RUNNING: "research",
  RESEARCH_REVIEW_REQUIRED: "research",
  RESEARCH_COMPLETED: "research",
  EVIDENCE_MATCHING_RUNNING: "evidence-match",
  EVIDENCE_MATCHING_COMPLETED: "evidence-match",
  V0_GENERATING: "resume-v0",
  V0_READY: "resume-v0",
  HR_AUDIT_1_RUNNING: "hr-audit-1",
  HR_AUDIT_1_REVIEW: "hr-audit-1",
  V1_GENERATING: "resume-v1",
  V1_READY: "resume-v1",
  EM_AUDIT_1_RUNNING: "em-audit-1",
  EM_AUDIT_1_REVIEW: "em-audit-1",
  V2_GENERATING: "resume-v2",
  V2_READY: "resume-v2",
  HR_AUDIT_2_RUNNING: "hr-audit-2",
  HR_AUDIT_2_REVIEW: "hr-audit-2",
  V3_GENERATING: "resume-v3",
  V3_READY: "resume-v3",
  EM_AUDIT_2_RUNNING: "em-audit-2",
  EM_AUDIT_2_REVIEW: "em-audit-2",
  V4_GENERATING: "resume-v4",
  V4_READY: "resume-v4",
  FINAL_QA_RUNNING: "final-qa",
  FINAL_QA_FAILED: "final-qa",
  FINAL_READY: "ready",
  CANCELLED: "ready",
  FAILED: "ready",
};

export function mapBackendStageToUi(stage: BackendStage | string): WorkflowStage {
  return BACKEND_TO_UI_STAGE[stage] ?? "research";
}

export function mapApplicationToUi(app: ApplicationRecord): Application {
  const status = (app.archived ? "archived" : app.status) as ApplicationStatus;
  return {
    id: app.publicId,
    company: app.company,
    companyMark: app.companyMark,
    role: app.role,
    location: app.location,
    employmentType: app.employmentType,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    deadline: app.deadline,
    status,
    stage: mapBackendStageToUi(app.stage),
    resumeScore: app.resumeScore,
    evidenceCoverage: app.evidenceCoverage,
    atsAlignment: app.atsAlignment,
    interviewStatus: app.interviewStatus as Application["interviewStatus"],
    researchConfidence: app.researchConfidence,
    ownerProfileId: "cand-deepak",
    jobDescriptionId: app.jobDescriptionPublicId ?? "jd-cisco",
    resumeId: app.resumePublicId ?? "resume-cisco",
    nextAction: app.nextAction,
    archived: app.archived,
    roleFamily: app.roleFamily,
  };
}

export function mapProfileToUi(p: CandidateProfileRecord): CandidateProfile {
  return {
    id: p.publicId,
    fullName: p.fullName,
    preferredName: p.preferredName ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    location: p.location ?? "",
    linkedIn: p.linkedIn ?? undefined,
    github: p.github ?? undefined,
    portfolio: p.portfolio ?? undefined,
    headline: p.headline ?? "",
    summary: p.summary ?? "",
    experienceLevel: (p.experienceLevel as CandidateProfile["experienceLevel"]) ?? "experienced",
    yearsExperience: p.yearsExperience ?? 0,
    targetRoleFamilies: p.targetRoleFamilies ?? [],
    preferredResumeLength: (p.preferredResumeLength as CandidateProfile["preferredResumeLength"]) ?? "one-page",
    careerGoal: p.careerGoal ?? "",
    avatarInitials: p.avatarInitials ?? "??",
    remoteOk: p.remoteOk,
    preferredLocations: p.preferredLocations ?? [],
    workAuthorization: p.workAuthorization ?? undefined,
    requiresSponsorship: p.requiresSponsorship ?? undefined,
    onboardingStep: p.onboardingStep,
    onboardingCompletedAt: p.onboardingCompletedAt,
    modelImprovementOptIn: p.modelImprovementOptIn,
    resumeImportStatus: p.resumeImportStatus,
  };
}

export function mapEvidenceToUi(item: EvidenceRecord): EvidenceItem {
  const payload = item.payload ?? {};
  return {
    id: item.publicId,
    title: item.title,
    organization: item.organization,
    situation: item.situation,
    task: item.task,
    actions: item.actions,
    result: item.result,
    metrics: Array.isArray(payload.metrics) ? (payload.metrics as EvidenceItem["metrics"]) : [],
    technologies: item.technologies,
    roleRelevance: Array.isArray(payload.roleRelevance) ? (payload.roleRelevance as string[]) : [],
    confidence: item.confidence as EvidenceItem["confidence"],
    verificationStatus: item.verificationStatus as EvidenceItem["verificationStatus"],
    supportingSource: typeof payload.supportingSource === "string" ? payload.supportingSource : undefined,
    privacyLevel: item.privacyLevel as EvidenceItem["privacyLevel"],
    lastUpdated: item.updatedAt,
    resumeUsageHistory: Array.isArray(payload.resumeUsageHistory)
      ? (payload.resumeUsageHistory as string[])
      : [],
    interviewStoryReady: Boolean(payload.interviewStoryReady),
    tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
  };
}

export function mapResumeToUi(
  resume: ResumeRecord,
  versions: ResumeVersionRecord[],
): Resume {
  return {
    id: resume.publicId,
    applicationId: resume.applicationPublicId,
    title: resume.title,
    templateId: resume.templateId,
    length: resume.length as Resume["length"],
    currentVersionId: resume.currentVersionPublicId ?? versions[versions.length - 1]?.publicId ?? "",
    versions: versions.map((v) => ({
      id: v.publicId,
      versionLabel: v.versionLabel,
      versionNumber: v.versionNumber,
      createdAt: v.createdAt,
      notes: v.notes,
      score: v.score,
      scoreBreakdown: {
        atsCompatibility: Number(v.scoreBreakdown.atsCompatibility ?? 0),
        jobAlignment: Number(v.scoreBreakdown.jobAlignment ?? 0),
        recruiterReadability: Number(v.scoreBreakdown.recruiterReadability ?? 0),
        impact: Number(v.scoreBreakdown.impact ?? 0),
        quantification: Number(v.scoreBreakdown.quantification ?? 0),
        technicalDepth: Number(v.scoreBreakdown.technicalDepth ?? 0),
        competencyCoverage: Number(v.scoreBreakdown.competencyCoverage ?? 0),
        evidenceConfidence: Number(v.scoreBreakdown.evidenceConfidence ?? 0),
        writingQuality: Number(v.scoreBreakdown.writingQuality ?? 0),
        formatIntegrity: Number(v.scoreBreakdown.formatIntegrity ?? 0),
      },
      triggeredBy: v.triggeredBy,
      sections: (v.sections as Resume["versions"][0]["sections"]) ?? [],
    })),
  };
}

export function mapFindingToUi(f: AuditFindingRecord): AuditFinding {
  return {
    id: f.publicId,
    auditId: f.auditRunPublicId,
    severity: f.severity as AuditFinding["severity"],
    status: f.status as AuditFinding["status"],
    section: f.section,
    title: f.title,
    explanation: f.explanation,
    beforeText: f.beforeText,
    suggestedText: f.editedText ?? f.suggestedText,
    evidenceSource: f.evidenceSource,
    expectedScoreImpact: f.expectedScoreImpact,
  };
}

export function mapAuditRunToUi(run: AuditRunRecord, findings: AuditFindingRecord[]): Audit {
  return {
    id: run.publicId,
    applicationId: run.applicationPublicId,
    lens: run.lens as Audit["lens"],
    label: run.label,
    reviewsVersion: run.reviewsVersion,
    producesVersion: run.producesVersion,
    status: run.status as Audit["status"],
    scoreBefore: run.scoreBefore,
    scoreAfter: run.scoreAfter,
    findings: findings.map(mapFindingToUi),
    completedAt: run.completedAt,
    summary: run.summary,
  };
}

export type WorkflowStatusView = {
  run: WorkflowRunRecord | null;
  events: WorkflowEventRecord[];
};

async function buildRuntime(): Promise<Runtime> {
  const env = getEnv();
  const mode = env.CANDIDARC_DATA_MODE;

  if (env.APP_MODE === "production" && mode === "memory") {
    throw new Error("Production runtime cannot use memory repositories");
  }
  let repos: Repositories;
  let store: Repositories["store"];
  if (mode === "postgres") {
    const { PostgresRepositories, isMemoryBackedRepository } = await import("./database/postgres-repos");
    repos = new PostgresRepositories();
    if (isMemoryBackedRepository(repos)) {
      throw new Error("Postgres mode cannot use memory-backed repositories");
    }
    store = repos.store;
  } else {
    if (env.APP_MODE !== "demo") {
      throw new Error("Memory repositories are only available when APP_MODE=demo");
    }
    const { ensureDemoUser } = await import("./auth/demo-auth");
    const demo = await ensureDemoUser();
    repos = demo.repos;
    store = demo.store;
    seedDemoAppsIntoMemory(store, { tenantId: demo.tenantId, userId: demo.userId });
    const ownedEvidence = await repos.evidence.list(demo.tenantId, { ownerUserId: demo.userId });
    if (!ownedEvidence.length) {
      await repos.evidence.create({
        id: newId("ev"),
        publicId: "ev-demo-career-notes",
        tenantId: demo.tenantId,
        ownerUserId: demo.userId,
        candidateProfileId: null,
        title: "Career notes",
        organization: "Personal",
        situation: "Building production systems across platform and AI workloads.",
        task: "Deliver reliable services with measurable outcomes.",
        actions: ["Owned API platforms", "Improved latency and reliability", "Mentored engineers"],
        result: "Shipped durable platform improvements with clear ownership.",
        technologies: ["Python", "TypeScript", "AWS", "Kubernetes"],
        confidence: "high",
        verificationStatus: "user_attested",
        privacyLevel: "share-safe",
        excludedFromApplicationIds: [],
        matchedApplicationIds: [],
        payload: { source: "demo-seed" },
      });
    }
  }

  const queue = await getQueueAdapter();
  const engine = new DbWorkflowEngine(repos.workflows, queue);
  const pipeline = ResumePipeline.fromRepos(repos, engine, queue);

  queue.onExhaustedRetries(async (job, error) => {
    await handleWorkflowJobExhausted(repos, engine, job, error);
  });

  for (const q of WORKFLOW_QUEUES) {
    queue.registerHandler(q, async (job) => {
      const payload = job.payload as WorkflowJobPayload;
      let run: WorkflowRunRecord | null = null;
      if (payload.workflowRunId) {
        run = await repos.workflows.getById(payload.workflowRunId);
      } else if (payload.tenantId && payload.workflowPublicId) {
        run = await repos.workflows.getByPublicId(payload.tenantId, payload.workflowPublicId);
      }
      if (!run) {
        logger.warn({ jobId: job.id, queue: q }, "workflow job missing run");
        return;
      }
      if (payload.stage && !stageMatchesJobClaim(run.stage, payload.stage)) {
        logger.info(
          { workflowId: run.publicId, jobStage: payload.stage, runStage: run.stage, jobId: job.id },
          "stale workflow job skipped",
        );
        return;
      }
      const claimedStage = payload.stage ?? run.stage;
      await pipeline.handleStage(run, claimedStage);
    });
  }

  queue.registerHandler("pdf-rendering", async (job) => {
    const payload = job.payload as { tenantId?: string; applicationId?: string; applicationPublicId?: string; versionId?: string; versionPublicId?: string; ownerUserId?: string };
    const tenantId = payload.tenantId;
    const applicationPublicId = payload.applicationId ?? payload.applicationPublicId;
    const versionPublicId = payload.versionId ?? payload.versionPublicId;
    if (!tenantId || !applicationPublicId || !versionPublicId) {
      throw new Error("Document rendering payload is incomplete");
    }
    const app = await repos.applications.getByPublicId(tenantId, applicationPublicId);
    const version = await repos.resumes.getVersion(tenantId, versionPublicId);
    if (!app || !version) throw new Error("Document rendering source not found");
    const rendered = await renderPdfAndDocx({
      resumeVersion: version,
      candidateName: typeof app.metadata?.candidateName === "string" ? app.metadata.candidateName : "Candidate",
      role: app.role,
      company: app.company,
      tenantId,
      applicationId: app.publicId,
      contact: {
        name: typeof app.metadata?.candidateName === "string" ? app.metadata.candidateName : undefined,
        email: typeof app.metadata?.candidateEmail === "string" ? app.metadata.candidateEmail : undefined,
        phone: typeof app.metadata?.candidatePhone === "string" ? app.metadata.candidatePhone : undefined,
        location: typeof app.metadata?.candidateLocation === "string" ? app.metadata.candidateLocation : app.location,
        linkedIn: typeof app.metadata?.candidateLinkedIn === "string" ? app.metadata.candidateLinkedIn : undefined,
        github: typeof app.metadata?.candidateGithub === "string" ? app.metadata.candidateGithub : undefined,
        portfolio: typeof app.metadata?.candidatePortfolio === "string" ? app.metadata.candidatePortfolio : undefined,
      },
    });
    const ownerSegment = app.ownerUserId ?? payload.ownerUserId ?? "unknown";
    const versionSegment = version.publicId;
    const pdfStorageKey = `generated/${ownerSegment}/${applicationPublicId}/${versionSegment}/resume.pdf`;
    const docxStorageKey = `generated/${ownerSegment}/${applicationPublicId}/${versionSegment}/resume.docx`;
    const storage = getStorage();
    await Promise.all([
      storage.putObject({
        tenantId,
        key: pdfStorageKey,
        body: rendered.pdfBuffer,
        contentType: "application/pdf",
      }),
      storage.putObject({
        tenantId,
        key: docxStorageKey,
        body: rendered.docxBuffer,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ]);
    await Promise.all([
      repos.files.create({
        id: newId("sf"),
        publicId: rendered.pdfFileId,
        tenantId,
        ownerUserId: app.ownerUserId,
        purpose: "customer-resume-pdf",
        storageKey: pdfStorageKey,
        mimeType: "application/pdf",
        size: rendered.pdfBuffer.byteLength,
        scanStatus: "clean",
        retentionState: "active",
      }),
      repos.files.create({
        id: newId("sf"),
        publicId: rendered.docxFileId,
        tenantId,
        ownerUserId: app.ownerUserId,
        purpose: "customer-resume-docx",
        storageKey: docxStorageKey,
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: rendered.docxBuffer.byteLength,
        scanStatus: "clean",
        retentionState: "active",
      }),
    ]);
    const finals = Array.isArray(app.metadata?.customerFinalVersions)
      ? app.metadata.customerFinalVersions.filter((item): item is string => typeof item === "string")
      : [];
    await repos.applications.update(tenantId, app.publicId, {
      status: "ready",
      nextAction: "Download resume",
      metadata: {
        ...app.metadata,
        customerFiles: {
          pdfFileId: rendered.pdfFileId,
          docxFileId: rendered.docxFileId,
          pdfStorageKey,
          docxStorageKey,
          pageCount: rendered.pageCount,
        },
        customerFinalVersions: finals.includes(version.publicId) ? finals : [...finals, version.publicId],
      },
    });
    logger.info({ jobId: job.id, applicationPublicId, versionPublicId }, "resume documents rendered");
  });

  const storage = getStorage();
  queue.registerHandler("notifications", async () => undefined);
  queue.registerHandler("maintenance", async (job) => {
    const payload = job.payload as { tenantId?: string; filePublicId?: string };
    if (job.name === "files.malware_scan" && payload.tenantId && payload.filePublicId) {
      const importService = ResumeImportService.fromRepos(repos, storage, queue);
      await importService.runMalwareScan(payload.tenantId, payload.filePublicId);
    }
  });
  queue.registerHandler("document-parsing", async (job) => {
    const payload = job.payload as { tenantId?: string; filePublicId?: string };
    if (job.name === "resume.extract" && payload.tenantId && payload.filePublicId) {
      const importService = ResumeImportService.fromRepos(repos, storage, queue);
      await importService.runExtraction(payload.tenantId, payload.filePublicId);
    }
  });

  const profile = ProfileService.fromRepos(repos);
  const resumeImport = ResumeImportService.fromRepos(repos, storage, queue);
  const applications = ApplicationsService.fromRepos(repos, engine);
  const customerResumes = new CustomerGenerateService(repos, engine, storage);
  let radar: RadarService | null = null;
  if (isFeatureRadarEnabled(env)) {
    if (env.APP_MODE === "demo") {
      seedDemoCatalog();
    }
    radar = RadarService.create(applications, repos, customerResumes);
    registerRadarQueueHandlers(queue, radar.catalog, radar.index);
    void queue.enqueue("job-indexing", "radar-reindex", { reason: "bootstrap" });
    void queue.enqueue("job-alerting", "radar-alerts-sweep", { reason: "bootstrap" });
  }

  const copilot = isFeatureCopilotEnabled(env) ? new CopilotService() : null;

  const services: RuntimeServices = {
    applications,
    research: ResearchService.fromRepos(repos, engine),
    evidence: EvidenceService.fromRepos(repos),
    resumes: ResumesService.fromRepos(repos, engine, queue),
    audits: AuditsService.fromRepos(repos, engine),
    workflows: WorkflowsService.fromRepos(repos, engine),
    usage: UsageService.fromRepos(repos),
    files: FilesService.fromRepos(repos, storage, queue),
    profile,
    resumeImport,
    radar,
    copilot,
    customerResumes,
  };

  if (mode === "memory" && env.QUEUE_BACKEND === "inprocess" && !queueDrainStarted) {
    queueDrainStarted = true;
    // InProcessQueueAdapter pumps every 50ms once started; start once for memory mode.
    void queue.start().then(async () => {
      const recovered = await engine.recoverIncomplete();
      logger.info({ recovered }, "memory-mode in-process queue drain started");
    });
  }

  return {
    mode,
    repos,
    queue,
    engine,
    pipeline,
    services,
    store,
  };
}

export async function getRuntime(): Promise<Runtime> {
  if (!runtimePromise) {
    runtimePromise = buildRuntime().catch((err) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}

export function resetRuntimeForTests() {
  runtimePromise = null;
  queueDrainStarted = false;
}

export { getDemoExtras };
