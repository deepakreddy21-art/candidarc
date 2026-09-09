/** @vitest-environment node */
import { resolve } from "path";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { ensureDemoUser, DEMO_USER } from "../../server/auth/demo-auth";
import type { AuthContext } from "../../server/auth/guards";
import {
  createEmptyMemoryStore,
  MemoryRepositories,
  newId,
  type Repositories,
} from "../../server/database/repositories";
import { ProfileService } from "../../server/modules/profile/service";
import {
  MAX_RESUME_BYTES,
  ResumeImportService,
} from "../../server/modules/resumes/import-service";
import { normalizeResumeText } from "../../server/modules/resumes/text-extractor";
import { LocalFilesystemStorage } from "../../server/storage/local";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { resetStorage } from "../../server/storage";
import {
  NO_EMPLOYMENT_RESUME,
  PROFESSIONAL_EXPERIENCE_RESUME,
  WORK_HISTORY_RESUME,
  textToSimplePdf,
} from "./fixtures/resume-samples";

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "profile_test",
    user: { id: userId, publicId: "profile_user", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

describe("profile and resume import", () => {
  beforeEach(() => {
    resetStorage();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates and updates a tenant-scoped candidate profile", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const profileService = ProfileService.fromRepos(repos);
    const ctx = context(userId, tenantId, repos);

    const created = await profileService.getOrCreate(ctx);
    expect(created.tenantId).toBe(tenantId);
    expect(created.userId).toBe(userId);

    const updated = await profileService.update(ctx, {
      fullName: "Ada Lovelace",
      careerGoal: "Platform engineering leadership",
      targetRoleFamilies: ["Backend Platform"],
    });
    expect(updated.fullName).toBe("Ada Lovelace");
    expect(updated.targetRoleFamilies).toContain("Backend Platform");
  });

  it("isolates profiles by tenant", async () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const tenantA = newId("ten");
    const tenantB = newId("ten");
    const userA = newId("usr");
    const userB = newId("usr");

    await repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId: tenantA,
      userId: userA,
      fullName: "Tenant A",
      preferredName: null,
      email: null,
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "TA",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: null,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: null,
      resumeImportExtraction: null,
    });

    await repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId: tenantB,
      userId: userB,
      fullName: "Tenant B",
      preferredName: null,
      email: null,
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "TB",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: null,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: null,
      resumeImportExtraction: null,
    });

    const a = await repos.candidateProfiles.getByUser(tenantA, userA);
    const cross = await repos.candidateProfiles.getByUser(tenantA, userB);
    expect(a?.fullName).toBe("Tenant A");
    expect(cross).toBeNull();
  });

  it("rejects invalid uploads", () => {
    const store = createEmptyMemoryStore();
    const repos = new MemoryRepositories(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-1"), "test-secret-1");
    const service = ResumeImportService.fromRepos(repos, storage, queue);

    expect(() =>
      service.validateUpload({
        filename: "resume.exe",
        mimeType: "application/pdf",
        size: 10,
        buffer: Buffer.from("%PDF"),
      }),
    ).toThrow(/PDF and DOCX/i);

    expect(() =>
      service.validateUpload({
        filename: "resume.pdf",
        mimeType: "application/pdf",
        size: MAX_RESUME_BYTES + 1,
        buffer: Buffer.alloc(100),
      }),
    ).toThrow(/under/i);

    expect(() =>
      service.validateUpload({
        filename: "resume.pdf",
        mimeType: "application/pdf",
        size: 8,
        buffer: Buffer.from("not-pdf"),
      }),
    ).toThrow(/valid PDF/i);
  });

  it("normalizes PROFESSIONAL EXPERIENCE and WORK HISTORY headings locally", () => {
    const professional = normalizeResumeText(PROFESSIONAL_EXPERIENCE_RESUME);
    expect(professional.employment.length).toBeGreaterThanOrEqual(2);
    expect(professional.employment.map((j) => j.company)).toEqual(
      expect.arrayContaining(["Harbor Systems", "Northwind Labs"]),
    );
    expect(professional.skills).toEqual(
      expect.arrayContaining(["TypeScript", "Kubernetes", "PostgreSQL"]),
    );

    const workHistory = normalizeResumeText(WORK_HISTORY_RESUME);
    expect(workHistory.employment.length).toBeGreaterThanOrEqual(2);
  });

  it("blocks extraction before malware scan completes", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-2"), "test-secret-2");
    const service = ResumeImportService.fromRepos(repos, storage, queue);
    const ctx = context(userId, tenantId, repos);

    const pdf = textToSimplePdf(PROFESSIONAL_EXPERIENCE_RESUME);
    const uploaded = await service.upload(ctx, {
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: pdf.byteLength,
      buffer: pdf,
    });
    expect(uploaded.file.scanStatus).toBe("pending");
    await expect(service.runExtraction(tenantId, uploaded.file.id)).rejects.toThrow(/malware scan/i);
  });

  it("marks import failed when retries are exhausted", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-ex"), "test-secret-ex");
    const service = ResumeImportService.fromRepos(repos, storage, queue);
    const ctx = context(userId, tenantId, repos);
    const pdf = textToSimplePdf("Name Only\nSKILLS\nGo");
    const uploaded = await service.upload(ctx, {
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: pdf.byteLength,
      buffer: pdf,
    });
    await service.markImportFailed(tenantId, uploaded.file.id, "PARSE_FAILED", "exhausted");
    const status = await service.getImportStatus(ctx);
    expect(status.status).toBe("failed");
    expect(status.extraction?.errorCode).toBe("PARSE_FAILED");
  });

  it("does not overwrite confirmed profiles on parse failure", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    await repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId,
      fullName: "Confirmed User",
      preferredName: null,
      email: "c@example.com",
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "CU",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: null,
      onboardingStep: 2,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: "file-confirmed",
      resumeImportStatus: "confirmed",
      resumeImportExtraction: {
        employment: [{ title: "Engineer", company: "Acme", bullets: ["Shipped"] }],
        education: [],
        projects: [],
        skills: ["Go"],
        certifications: [],
        evidence: [],
        rawText: "kept",
        parseWarnings: [],
      },
    });
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-conf"), "test-secret-conf");
    const service = ResumeImportService.fromRepos(repos, storage, queue);
    await service.runExtraction(tenantId, "file-confirmed");
    const profile = await repos.candidateProfiles.getByUser(tenantId, userId);
    expect(profile?.resumeImportStatus).toBe("confirmed");
    expect((profile?.resumeImportExtraction as { rawText?: string })?.rawText).toBe("kept");
  });

  it("replacement upload clears prior extraction on the profile", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-repl"), "test-secret-repl");
    const service = ResumeImportService.fromRepos(repos, storage, queue);
    const ctx = context(userId, tenantId, repos);

    await repos.candidateProfiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId,
      fullName: "Old",
      preferredName: null,
      email: null,
      phone: null,
      location: null,
      linkedIn: null,
      github: null,
      portfolio: null,
      headline: null,
      summary: null,
      experienceLevel: null,
      yearsExperience: null,
      targetRoleFamilies: [],
      preferredResumeLength: "one-page",
      careerGoal: null,
      avatarInitials: "OL",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      targetCompanies: [],
      targetIndustries: [],
      jobTypes: [],
      workplaceModes: [],
      willingToRelocate: null,
      salaryPreference: null,
      seniority: null,
      onboardingStep: 2,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: "old-file",
      resumeImportStatus: "ready_for_review",
      resumeImportExtraction: {
        employment: [{ title: "Old Role", company: "Old Co", bullets: ["old"] }],
        education: [],
        projects: [],
        skills: ["Legacy"],
        certifications: [],
        evidence: [],
        rawText: "old",
        parseWarnings: [],
      },
    });

    const pdf = textToSimplePdf(NO_EMPLOYMENT_RESUME);
    const uploaded = await service.upload(ctx, {
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: pdf.byteLength,
      buffer: pdf,
    });
    expect(uploaded.file.id).not.toBe("old-file");
    const status = await service.getImportStatus(ctx);
    expect(status.status).toBe("pending_scan");
    expect(status.extraction).toBeNull();
  });

  it("same filename with different content creates distinct checksums", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-hash"), "test-secret-hash");
    const service = ResumeImportService.fromRepos(repos, storage, queue);
    const ctx = context(userId, tenantId, repos);

    const a = textToSimplePdf(PROFESSIONAL_EXPERIENCE_RESUME);
    const b = textToSimplePdf(WORK_HISTORY_RESUME);
    const upA = await service.upload(ctx, {
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: a.byteLength,
      buffer: a,
    });
    const upB = await service.upload(ctx, {
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: b.byteLength,
      buffer: b,
    });
    const fileA = await repos.files.getByPublicId(tenantId, upA.file.id);
    const fileB = await repos.files.getByPublicId(tenantId, upB.file.id);
    expect(fileA?.checksum).not.toBe(fileB?.checksum);
  });
});

describe("onboarding career validation", () => {
  it("allows ready_for_review without re-entering employment", async () => {
    const { validateStepClient, emptyOnboardingForm } = await import("../../src/components/onboarding/types");
    const form = {
      ...emptyOnboardingForm(),
      fullName: "",
      employment: [],
      skills: [],
    };
    expect(validateStepClient(2, form, "ready_for_review")).toBeNull();
  });

  it("allows candidates with skills and education but no employment", async () => {
    const { validateStepClient, emptyOnboardingForm } = await import("../../src/components/onboarding/types");
    const form = {
      ...emptyOnboardingForm(),
      fullName: "Sam Rivera",
      employment: [],
      education: [{ school: "Lakeside College", degree: "B.A." }],
      skills: ["TypeScript", "React"],
    };
    expect(validateStepClient(2, form, null)).toBeNull();
  });

  it("never asks to re-enter when employment was extracted", async () => {
    const { validateStepClient, emptyOnboardingForm } = await import("../../src/components/onboarding/types");
    const form = {
      ...emptyOnboardingForm(),
      fullName: "Jordan",
      employment: [{ title: "Platform Engineer", company: "Harbor Systems", bullets: ["Built pipelines"] }],
      skills: ["TypeScript"],
    };
    expect(validateStepClient(2, form, "ready_for_review")).toBeNull();
    expect(validateStepClient(2, form, "confirmed")).toBeNull();
  });
});
