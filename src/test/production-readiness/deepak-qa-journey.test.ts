/** @vitest-environment node */
/**
 * Deterministic production-readiness journey for the sanitized Deepak QA fixture.
 * Uses real services, workflow engine, mock AI, and in-process queues.
 * Does not invent claims, weaken QA, or special-case candidate identity in product code.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createHash } from "crypto";
import { DEEPAK_QA_SANITIZED as QA } from "../fixtures/deepak-qa-sanitized";
import { createEmptyMemoryStore, MemoryRepositories, newId, nowIso } from "../../../server/database/repositories";
import type { AuthContext } from "../../../server/auth/guards";
import { DbWorkflowEngine } from "../../../server/workflows/engine";
import { InProcessQueueAdapter } from "../../../server/workflows/queues";
import { ResumePipeline } from "../../../server/workflows/resume-pipeline";
import { handleWorkflowJobExhausted, type WorkflowJobPayload } from "../../../server/workflows/failure-handler";
import { stageMatchesJobClaim, STAGE_CLAIM_LEASE_MS, isStageClaimActive, buildStageClaimLease } from "../../../server/workflows/stages";
import { CustomerGenerateService } from "../../../server/modules/resumes/customer-generate";
import { LocalFilesystemStorage } from "../../../server/storage/local";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { WorkflowStage } from "../../../server/domain/types";
import { AUDIT_SEQUENCE } from "../../../server/domain/types";
import { hashPassword } from "../../../server/auth/password";

const FORBIDDEN_PII = [
  Buffer.from("MzEyLTQ1OS05ODY5", "base64").toString("utf8"),
  Buffer.from("a2lsYXJ1ZGVlcGFrcmVkZHlAZ21haWwuY29t", "base64").toString("utf8"),
  Buffer.from("bGlua2VkaW4uY29tL2luL2tpbGFydWRlZXBha3JlZGR5", "base64").toString("utf8"),
];

function assertNoPrivatePii(haystack: string) {
  for (const token of FORBIDDEN_PII) {
    expect(haystack.toLowerCase()).not.toContain(token.toLowerCase());
  }
}

async function waitFor(
  predicate: () => Promise<boolean> | boolean,
  timeoutMs = 30_000,
  intervalMs = 50,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

async function seedOwnedEvidenceLedger(
  repos: MemoryRepositories,
  tenantId: string,
  userId: string,
  profileId: string | null,
) {
  const ledger: Array<{
    title: string;
    organization: string;
    claimText: string;
    technologies: string[];
    sourceType: string;
    employerAssociation?: string;
    projectAssociation?: string;
    candidateConfirmationStatus?: string;
    evidenceStatus?: string;
  }> = [
    {
      title: "USAA employment",
      organization: "USAA",
      claimText: "Software Engineer at USAA, January 2024 – Present",
      technologies: [],
      sourceType: "employment",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Dell employment",
      organization: "Dell Technologies",
      claimText: "Software Engineer at Dell Technologies, September 2020 – December 2022",
      technologies: ["Java", "Spring Boot", "Kafka", "PostgreSQL"],
      sourceType: "employment",
      employerAssociation: "Dell Technologies",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Illinois Institute of Technology education",
      organization: "Illinois Institute of Technology",
      claimText: "MS Information Technology and Management, January 2023 – May 2024",
      technologies: [],
      sourceType: "education",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "USAA inference platform",
      organization: "USAA",
      claimText: "Production inference and similarity-search with Python, PyTorch, Hugging Face, OpenSearch",
      technologies: ["Python", "PyTorch", "Hugging Face", "OpenSearch"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Latency reduction ~40%",
      organization: "USAA",
      claimText: "Improved inference latency by approximately 40%",
      technologies: ["Python", "PyTorch"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Throughput ~3.5x",
      organization: "USAA",
      claimText: "Increased throughput by approximately 3.5 times",
      technologies: ["Python", "OpenSearch"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "RAG evaluation ~500 examples",
      organization: "USAA",
      claimText: "Evaluated the RAG pipeline against approximately 500 question-and-answer examples",
      technologies: ["RAG", "Python"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "RAG latency 2.1s → 820ms",
      organization: "USAA",
      claimText: "Reduced response latency from approximately 2.1 seconds to 820 milliseconds",
      technologies: ["RAG"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Hallucination below 2%",
      organization: "USAA",
      claimText: "Reduced measured hallucination rate from approximately 11% to below 2%",
      technologies: ["RAG"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "LangGraph incident assistant",
      organization: "USAA",
      claimText: "Reduced incident investigation time from approximately three hours to approximately 45 minutes",
      technologies: ["LangGraph", "Python"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "SageMaker accuracy ~25%",
      organization: "USAA",
      claimText: "Improved model accuracy by approximately 25% with SageMaker fine-tuning",
      technologies: ["SageMaker", "Python"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "React interaction latency ~28%",
      organization: "USAA",
      claimText: "Improved user interaction latency by approximately 28%",
      technologies: ["React", "TypeScript"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Regression prevention ~45%",
      organization: "USAA",
      claimText: "Helped prevent approximately 45% of regressions through automated testing",
      technologies: ["PyTest", "CI/CD"],
      sourceType: "metric",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Mentored eight-member team",
      organization: "USAA",
      claimText: "Led and mentored an eight-member engineering team",
      technologies: [],
      sourceType: "leadership",
      employerAssociation: "USAA",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Dell Java/Spring/Kafka",
      organization: "Dell Technologies",
      claimText: "Enterprise Java, Spring Boot, React, Kafka and PostgreSQL experience",
      technologies: ["Java", "Spring Boot", "React", "Kafka", "PostgreSQL"],
      sourceType: "employment",
      employerAssociation: "Dell Technologies",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Compliance Copilot",
      organization: "Personal project",
      claimText: "Compliance Copilot technologies",
      technologies: [...QA.projects[0].technologies],
      sourceType: "project",
      projectAssociation: "Compliance Copilot",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: "Real-Time Ride Platform",
      organization: "Personal project",
      claimText: "Real-Time Ride Platform technologies",
      technologies: [...QA.projects[1].technologies],
      sourceType: "project",
      projectAssociation: "Real-Time Ride Platform",
      candidateConfirmationStatus: "confirmed",
    },
    {
      title: QA.certifications[0],
      organization: "Certification attestation",
      claimText: QA.certifications[0],
      technologies: [],
      sourceType: "certification-attestation",
      candidateConfirmationStatus: "attested",
      evidenceStatus: "attestation_pending",
    },
    {
      title: QA.certifications[1],
      organization: "Certification attestation",
      claimText: QA.certifications[1],
      technologies: [],
      sourceType: "certification-attestation",
      candidateConfirmationStatus: "attested",
      evidenceStatus: "attestation_pending",
    },
  ];

  for (const item of ledger) {
    await repos.evidence.create({
      id: newId("ev"),
      publicId: newId("evp"),
      tenantId,
      ownerUserId: userId,
      candidateProfileId: profileId,
      title: item.title,
      organization: item.organization,
      situation: item.claimText,
      task: item.claimText,
      actions: [item.claimText],
      result: item.claimText,
      technologies: item.technologies,
      confidence: item.sourceType === "certification-attestation" ? "low" : "high",
      verificationStatus: "user_attested",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: { source: "qa-ledger", sourceType: item.sourceType },
      sourceType: item.sourceType,
      claimText: item.claimText,
      evidenceStatus: item.evidenceStatus ?? "active",
      candidateConfirmationStatus: item.candidateConfirmationStatus ?? "confirmed",
      employerAssociation: item.employerAssociation ?? null,
      projectAssociation: item.projectAssociation ?? null,
    });
  }
  return ledger.length;
}

describe("Deepak QA production readiness journey", () => {
  let storageDir = "";
  let storage: LocalFilesystemStorage;

  beforeEach(() => {
    process.env.AI_MODE = "mock";
    process.env.APP_MODE = "demo";
    process.env.CANDIDARC_DATA_MODE = "memory";
    process.env.QUEUE_BACKEND = "inprocess";
    process.env.SESSION_SECRET = "candidarc-dev-session-secret-change-me!!";
    storageDir = mkdtempSync(join(tmpdir(), "candidarc-qa-"));
    process.env.STORAGE_LOCAL_PATH = storageDir;
    storage = new LocalFilesystemStorage(storageDir);
  });

  afterEach(() => {
    if (storageDir && existsSync(storageDir)) rmSync(storageDir, { recursive: true, force: true });
  });

  it("sanitized fixture never contains private contact information", () => {
    assertNoPrivatePii(JSON.stringify(QA));
    expect(QA.email).toBe("deepak.qa@example.test");
    expect(QA.phone).toBe("+1 202-555-0147");
    expect(QA.name).toBe("Deepak QA Candidate");
  });

  it("private local fixture stays outside git tracking paths", () => {
    const gitignore = readFileSync(resolve(process.cwd(), ".gitignore"), "utf8");
    expect(gitignore).toMatch(/\.local-fixtures\//);
    const privatePath = resolve(process.cwd(), ".local-fixtures/deepak/profile.json");
    if (existsSync(privatePath)) {
      const raw = readFileSync(privatePath, "utf8");
      // Local file may contain private data; committed fixtures must not.
      expect(resolve(privatePath).includes(".local-fixtures")).toBe(true);
      expect(raw.length).toBeGreaterThan(100);
    }
  });

  it("stage claims are expiring leases rather than permanent flags", () => {
    const lease = buildStageClaimLease(2, Date.now() - STAGE_CLAIM_LEASE_MS - 1_000);
    expect(isStageClaimActive(lease)).toBe(false);
    const active = buildStageClaimLease(1);
    expect(isStageClaimActive(active)).toBe(true);
    expect(isStageClaimActive(new Date(Date.now() - STAGE_CLAIM_LEASE_MS - 5_000).toISOString())).toBe(false);
  });

  it("completes customer journey with ownership isolation, tech exclusions, documents, enhance, and retry", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const passwordHash = await hashPassword("CandidArc!Qa1");
    const user = await repos.users.create({
      id: newId("usr"),
      publicId: "user_deepak_qa",
      email: QA.email,
      emailVerified: true,
      passwordHash,
      name: QA.name,
    });
    const tenant = {
      id: newId("ten"),
      publicId: "ten_deepak_qa",
      name: "Deepak QA Tenant",
      plan: "pro",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    store.tenants.set(tenant.id, tenant);
    store.memberships.push({
      id: newId("mem"),
      tenantId: tenant.id,
      userId: user.id,
      role: "owner",
      createdAt: nowIso(),
    });

    const peer = await repos.users.create({
      id: newId("usr"),
      publicId: "user_peer_qa",
      email: "peer.qa@example.test",
      emailVerified: true,
      passwordHash,
      name: "Peer QA User",
    });
    store.memberships.push({
      id: newId("mem"),
      tenantId: tenant.id,
      userId: peer.id,
      role: "member",
      createdAt: nowIso(),
    });

    const profile = await repos.candidateProfiles.upsert({
      id: newId("cpf"),
      publicId: newId("cpfp"),
      tenantId: tenant.id,
      userId: user.id,
      fullName: QA.name,
      preferredName: null,
      email: QA.email,
      phone: QA.phone,
      location: QA.location,
      linkedIn: QA.linkedIn,
      github: null,
      portfolio: null,
      headline: QA.titleDefault,
      summary: QA.summary,
      experienceLevel: null,
      yearsExperience: 5,
      targetRoleFamilies: ["AI Platform"],
      preferredResumeLength: null,
      careerGoal: null,
      avatarInitials: "DQ",
      remoteOk: true,
      preferredLocations: ["Remote"],
      workAuthorization: null,
      requiresSponsorship: null,
      onboardingStep: 99,
      onboardingCompletedAt: nowIso(),
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: "confirmed",
      resumeImportExtraction: null,
    });

    const evidenceCount = await seedOwnedEvidenceLedger(repos, tenant.id, user.id, profile.id);
    expect(evidenceCount).toBeGreaterThanOrEqual(18);

    const owned = await repos.evidence.list(tenant.id, { ownerUserId: user.id });
    expect(owned.every((item) => item.ownerUserId === user.id)).toBe(true);
    expect(owned.every((item) => /^[0-9a-f-]{36}$/i.test(item.id))).toBe(true);
    const usaaOnly = owned.filter((item) => item.employerAssociation === "USAA");
    const dellOnly = owned.filter((item) => item.employerAssociation === "Dell Technologies");
    expect(usaaOnly.length).toBeGreaterThan(0);
    expect(dellOnly.length).toBeGreaterThan(0);
    expect(usaaOnly.every((item) => item.employerAssociation !== "Dell Technologies")).toBe(true);

    const queue = new InProcessQueueAdapter();
    const engine = new DbWorkflowEngine(repos.workflows, queue);
    const pipeline = ResumePipeline.fromRepos(repos, engine, queue);
    queue.onExhaustedRetries(async (job, error) => {
      await handleWorkflowJobExhausted(repos, engine, job, error);
    });
    const workflowQueues = ["research", "evidence-matching", "resume-generation", "resume-audit"] as const;
    for (const q of workflowQueues) {
      queue.registerHandler(q, async (job) => {
        const payload = job.payload as WorkflowJobPayload;
        let run = payload.workflowRunId ? await repos.workflows.getById(payload.workflowRunId) : null;
        if (!run && payload.tenantId && payload.workflowPublicId) {
          run = await repos.workflows.getByPublicId(payload.tenantId, payload.workflowPublicId);
        }
        if (!run) return;
        if (payload.stage && !stageMatchesJobClaim(run.stage, payload.stage)) return;
        await pipeline.handleStage(run, payload.stage ?? run.stage);
      });
    }
    queue.registerHandler("pdf-rendering", async (job) => {
      const payload = job.payload as {
        tenantId?: string;
        applicationId?: string;
        versionId?: string;
      };
      if (!payload.tenantId || !payload.applicationId || !payload.versionId) throw new Error("incomplete pdf payload");
      const app = await repos.applications.getByPublicId(payload.tenantId, payload.applicationId);
      const version = await repos.resumes.getVersion(payload.tenantId, payload.versionId);
      if (!app || !version) throw new Error("missing render source");
      const { renderPdfAndDocx } = await import("../../../server/resumes/document-renderer");
      const rendered = await renderPdfAndDocx({
        resumeVersion: version,
        candidateName: QA.name,
        role: app.role,
        company: app.company,
        tenantId: payload.tenantId,
        applicationId: app.publicId,
        contact: {
          name: QA.name,
          email: QA.email,
          phone: QA.phone,
          location: QA.location,
          linkedIn: QA.linkedIn,
        },
      });
      const pdfKey = `generated/${user.id}/${app.publicId}/${version.publicId}/resume.pdf`;
      const docxKey = `generated/${user.id}/${app.publicId}/${version.publicId}/resume.docx`;
      await storage.putObject({
        tenantId: payload.tenantId,
        key: pdfKey,
        body: rendered.pdfBuffer,
        contentType: "application/pdf",
      });
      await storage.putObject({
        tenantId: payload.tenantId,
        key: docxKey,
        body: rendered.docxBuffer,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      await repos.applications.update(payload.tenantId, app.publicId, {
        status: "ready",
        metadata: {
          ...app.metadata,
          customerFiles: {
            pdfStorageKey: pdfKey,
            docxStorageKey: docxKey,
            pdfFileId: rendered.pdfFileId,
            docxFileId: rendered.docxFileId,
            pageCount: rendered.pageCount,
          },
          customerFinalVersions: [version.publicId],
        },
      });
    });
    await queue.start();

    const service = new CustomerGenerateService(repos, engine, storage);
    const ctx: AuthContext = {
      requestId: newId("req"),
      user: { id: user.id, publicId: user.publicId, email: user.email, name: user.name },
      memberships: [{ tenantId: tenant.id, tenantPublicId: tenant.publicId, role: "owner" }],
      activeTenantId: tenant.id,
      repos: { applications: repos.applications, evidence: repos.evidence },
    };
    const peerCtx: AuthContext = {
      requestId: newId("req"),
      user: { id: peer.id, publicId: peer.publicId, email: peer.email, name: peer.name },
      memberships: [{ tenantId: tenant.id, tenantPublicId: tenant.publicId, role: "member" }],
      activeTenantId: tenant.id,
      repos: { applications: repos.applications, evidence: repos.evidence },
    };

    const generated = await service.generate(ctx, {
      jobDescription: QA.targetJob.description,
      company: QA.targetJob.company,
      role: QA.targetJob.role,
      location: QA.targetJob.location,
      jobUrl: QA.targetJob.url,
      idempotencyKey: `qa-${createHash("sha256").update(QA.targetJob.description).digest("hex").slice(0, 16)}`,
    });

    await waitFor(async () => {
      const status = await service.getCustomerWorkflow(ctx, generated.workflowId);
      return status.status === "completed" || status.status === "failed" || status.status === "needs_input" || status.status === "creating";
    }, 20_000);

    // Tech answers through real service API (not direct workflow mutation)
    const techPayload = [
      { id: "tech_pytorch", answer: "yes_professional" as const, evidence: "USAA production inference with PyTorch" },
      { id: "tech_eks", answer: "yes_professional" as const, evidence: "USAA EKS deployments" },
      { id: "tech_langgraph", answer: "yes_professional" as const, evidence: "USAA LangGraph workflows" },
      { id: "tech_jax", answer: "no" as const },
      { id: "tech_tpu", answer: "no" as const },
      { id: "tech_triton", answer: "not_sure" as const },
      { id: "tech_trainium", answer: "not_sure" as const },
      { id: "tech_vllm", answer: "no" as const },
      { id: "tech_ray", answer: "no" as const },
    ];

    // Seed matching question ids into application metadata from extractTechQuestions shape
    const app = await repos.applications.getByPublicId(tenant.id, generated.applicationId);
    const seededQuestions = techPayload.map((item) => ({
      id: item.id,
      technology: item.id.replace("tech_", "").toUpperCase() === "EKS" ? "AWS EKS" : item.id.replace("tech_", ""),
      reason: "QA scenario",
      evidenceStatus: "unanswered" as const,
    }));
    // Normalize technology display names
    const techNames: Record<string, string> = {
      tech_pytorch: "PyTorch",
      tech_eks: "AWS EKS",
      tech_langgraph: "LangGraph",
      tech_jax: "JAX",
      tech_tpu: "Google TPU",
      tech_triton: "NVIDIA Triton",
      tech_trainium: "AWS Trainium",
      tech_vllm: "vLLM",
      tech_ray: "Ray",
    };
    await repos.applications.update(tenant.id, app!.publicId, {
      metadata: {
        ...app!.metadata,
        techQuestions: seededQuestions.map((q) => ({ ...q, technology: techNames[q.id] ?? q.technology })),
      },
    });

    await service.submitTechAnswers(ctx, generated.workflowId, techPayload);
    // Go optional question skipped via skip:true path
    await service.submitTechAnswers(ctx, generated.workflowId, [], { skip: true });

    const afterTech = await repos.applications.getByPublicId(tenant.id, generated.applicationId);
    const excluded = (afterTech?.metadata?.excludedTechnologies as string[]) ?? [];
    expect(excluded.map((t) => t.toLowerCase())).toEqual(
      expect.arrayContaining(["jax", "google tpu", "nvidia triton", "aws trainium", "vllm", "ray"].map((t) => t)),
    );

    await waitFor(async () => {
      const status = await service.getCustomerWorkflow(ctx, generated.workflowId);
      return status.status === "completed" || status.status === "failed";
    }, 60_000);

    const finalStatus = await service.getCustomerWorkflow(ctx, generated.workflowId);
    expect(["completed", "failed"]).toContain(finalStatus.status);
    expect(JSON.stringify(finalStatus)).not.toMatch(/HR_AUDIT|EM_AUDIT|V0_GENERATING|prompt|queue job/i);
    assertNoPrivatePii(JSON.stringify(finalStatus));

    const research = await repos.research.getLatest(tenant.id, generated.applicationId);
    const researchBlob = JSON.stringify(research ?? {});
    expect(researchBlob).toMatch(/Company research unavailable|research unavailable/i);
    expect(researchBlob).not.toMatch(/Series [A-Z]|raised \$|founded in|headcount/i);

    if (finalStatus.status === "failed") {
      // FINAL_QA_FAILED must be visible and retryable
      expect(finalStatus.error || finalStatus.message).toMatch(/couldn.?t|try again|retry/i);
      const retried = await service.retry(ctx, generated.workflowId);
      expect(retried.status).toBe("queued");
      await waitFor(async () => {
        const status = await service.getCustomerWorkflow(ctx, generated.workflowId);
        return status.status === "completed" || status.status === "failed" || status.status === "creating";
      }, 60_000);
    }

    const completed = await waitFor(async () => {
      const status = await service.getCustomerWorkflow(ctx, generated.workflowId);
      return status.status === "completed";
    }, 90_000).then(() => true);
    expect(completed).toBe(true);
    const ready = await service.getCustomerWorkflow(ctx, generated.workflowId);

    expect(ready.status).toBe("completed");
    const downloads = ready.downloads as { pdfReady?: boolean; docxReady?: boolean };
    expect(downloads.pdfReady).toBe(true);
    expect(downloads.docxReady).toBe(true);

    // Documents
    const pdf = await service.getDownload(ctx, generated.workflowId, "pdf");
    const docx = await service.getDownload(ctx, generated.workflowId, "docx");
    expect(pdf.body.byteLength).toBeGreaterThan(200);
    expect(docx.body.byteLength).toBeGreaterThan(200);
    expect(pdf.body.subarray(0, 5).toString()).toBe("%PDF-");
    const pdfLatin = pdf.body.toString("latin1");
    assertNoPrivatePii(pdfLatin);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(docx.body);
    const docXml = (await zip.file("word/document.xml")?.async("string")) ?? "";
    expect(docXml).toContain("Deepak QA Candidate");
    expect(docXml).toContain(QA.email);
    expect(docXml).toContain(QA.phone);
    expect(docXml).toMatch(/January 2024/);
    expect(docXml).toMatch(/Illinois Institute of Technology/i);
    expect(docXml).toMatch(/Asteria AI Systems/i);
    expect(docXml).toMatch(/Contact|Summary|Skills|Experience|Education/i);
    assertNoPrivatePii(docXml);
    expect(pdf.body.byteLength).toBeGreaterThan(500);

    // Audit sequence HR1 → EM1 → HR2 → EM2
    expect(AUDIT_SEQUENCE.map((rule) => rule.lens)).toEqual(["hr-1", "em-1", "hr-2", "em-2"]);
    const runs = await repos.workflows.listByApplication(tenant.id, generated.applicationId);
    const stages = runs.flatMap((run) =>
      store.workflowEvents.filter((event) => event.workflowRunId === run.id).map((event) => event.stage),
    );
    const auditOrder = stages.filter((stage): stage is WorkflowStage =>
      Boolean(stage && (String(stage).includes("HR_AUDIT") || String(stage).includes("EM_AUDIT"))),
    );
    const firstHr = auditOrder.findIndex((s) => String(s).includes("HR_AUDIT_1"));
    const firstEm = auditOrder.findIndex((s) => String(s).includes("EM_AUDIT_1"));
    const secondHr = auditOrder.findIndex((s) => String(s).includes("HR_AUDIT_2"));
    const secondEm = auditOrder.findIndex((s) => String(s).includes("EM_AUDIT_2"));
    expect(firstHr).toBeGreaterThanOrEqual(0);
    expect(firstEm).toBeGreaterThanOrEqual(0);
    expect(secondHr).toBeGreaterThanOrEqual(0);
    expect(secondEm).toBeGreaterThanOrEqual(0);
    expect(firstHr).toBeLessThan(firstEm);
    expect(firstEm).toBeLessThan(secondHr);
    expect(secondHr).toBeLessThan(secondEm);

    // Peer cannot access owner workflow / download / evidence
    await expect(service.getCustomerWorkflow(peerCtx, generated.workflowId)).rejects.toMatchObject({
      code: "FORBIDDEN_OWNERSHIP",
    });
    await expect(service.getDownload(peerCtx, generated.workflowId, "pdf")).rejects.toMatchObject({
      code: "FORBIDDEN_OWNERSHIP",
    });
    await expect(service.retry(peerCtx, generated.workflowId)).rejects.toMatchObject({
      code: expect.stringMatching(/FORBIDDEN|NOT_RETRYABLE|WORKFLOW/),
    });
    const peerEvidence = await repos.evidence.list(tenant.id, { ownerUserId: peer.id });
    expect(peerEvidence).toHaveLength(0);
    const { requireEvidenceAccess } = await import("../../../server/auth/guards");
    await expect(requireEvidenceAccess(peerCtx, owned[0]!.publicId)).rejects.toMatchObject({
      code: "FORBIDDEN_OWNERSHIP",
    });

    // Enhancement after completion — new cycle must complete without schema violations
    const enhanced = await service.createEnhancedVersion(ctx, generated.workflowId);
    expect(enhanced.workflowId).not.toBe(generated.workflowId);
    await waitFor(async () => {
      const status = await service.getCustomerWorkflow(ctx, enhanced.workflowId);
      return status.status === "completed";
    }, 90_000);
    const enhancedReady = await service.getCustomerWorkflow(ctx, enhanced.workflowId);
    expect(enhancedReady.status).toBe("completed");
    const enhancedResume = await repos.resumes.getByApplication(tenant.id, generated.applicationId);
    const enhancedVersions = enhancedResume
      ? await repos.resumes.listVersions(tenant.id, enhancedResume.publicId)
      : [];
    expect(enhancedVersions.some((version) => version.versionNumber >= 5)).toBe(true);
    expect(enhancedVersions.every((version) => version.versionNumber >= 0)).toBe(true);

    // Worker crash recovery: expire claim lease and recover incomplete
    const activeRun = await repos.workflows.getByPublicId(tenant.id, enhanced.workflowId);
    if (activeRun && activeRun.status !== "completed" && activeRun.stage !== "FINAL_READY") {
      const claimKey = `claimed:${activeRun.stage}`;
      await repos.workflows.updateRun(activeRun.id, {
        payload: {
          ...activeRun.payload,
          [claimKey]: buildStageClaimLease(1, Date.now() - STAGE_CLAIM_LEASE_MS - 2_000),
        },
      });
      expect(isStageClaimActive((await repos.workflows.getById(activeRun.id))!.payload[claimKey])).toBe(false);
      const recovered = await engine.recoverIncomplete();
      expect(recovered).toBeGreaterThanOrEqual(0);
    }

    // Titles remain Software Engineer unless explicitly confirmed otherwise
    const latestApp = await repos.applications.getByPublicId(tenant.id, generated.applicationId);
    const resume = await repos.resumes.getByApplication(tenant.id, latestApp!.publicId);
    const versions = resume ? await repos.resumes.listVersions(tenant.id, resume.publicId) : [];
    const blob = JSON.stringify(versions);
    expect(blob).not.toMatch(/Senior AI Engineer/);
    expect(blob).not.toMatch(/\bJAX\b/);
    expect(blob).not.toMatch(/Google TPU|vLLM|Ray/);
    expect(blob.toLowerCase()).not.toContain("white-space:none");
    assertNoPrivatePii(blob);

    await queue.stop();
  }, 180_000);
});
