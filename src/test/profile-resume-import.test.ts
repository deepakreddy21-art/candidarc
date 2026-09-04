/** @vitest-environment node */
import { resolve } from "path";
import { describe, expect, it, beforeEach } from "vitest";
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
import { extractTextFromResume, normalizeResumeText } from "../../server/modules/resumes/text-extractor";
import { createMinimalDocx } from "../../server/resumes/document-renderer";
import { LocalFilesystemStorage } from "../../server/storage/local";
import { InProcessQueueAdapter } from "../../server/workflows/queues";
import { resetStorage } from "../../server/storage";

function context(userId: string, tenantId: string, repos: Repositories): AuthContext {
  return {
    requestId: "profile_test",
    user: { id: userId, publicId: "profile_user", email: DEMO_USER.email, name: DEMO_USER.name },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    activeTenantId: tenantId,
    repos: { applications: repos.applications, evidence: repos.evidence },
  };
}

function minimalPdfBuffer(text = "Jane Doe Software Engineer TypeScript React"): Buffer {
  const safe = text.replace(/[()\\]/g, " ");
  const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
trailer << /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`;
  return Buffer.from(pdf);
}

describe("profile and resume import", () => {
  beforeEach(() => {
    resetStorage();
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
      careerGoal: "A",
      avatarInitials: "TA",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
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
      careerGoal: "B",
      avatarInitials: "TB",
      remoteOk: true,
      preferredLocations: [],
      workAuthorization: null,
      requiresSponsorship: null,
      onboardingStep: 0,
      onboardingCompletedAt: null,
      modelImprovementOptIn: false,
      sourceResumeFilePublicId: null,
      resumeImportStatus: null,
      resumeImportExtraction: null,
    });

    const a = await repos.candidateProfiles.getByUser(tenantA, userA);
    const cross = await repos.candidateProfiles.getByUser(tenantB, userA);
    expect(a?.fullName).toBe("Tenant A");
    expect(cross).toBeNull();
  });

  it("rejects invalid, empty, and oversized resume uploads", async () => {
    const store = createEmptyMemoryStore();
    const { repos } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads"), "test-secret");
    const service = ResumeImportService.fromRepos(repos, storage, queue);

    expect(() =>
      service.validateUpload({
        filename: "resume.exe",
        mimeType: "application/octet-stream",
        size: 10,
        buffer: Buffer.from("MZ"),
      }),
    ).toThrow(/PDF and DOCX/);

    expect(() =>
      service.validateUpload({
        filename: "resume.pdf",
        mimeType: "application/pdf",
        size: 0,
        buffer: Buffer.alloc(0),
      }),
    ).toThrow(/empty/i);

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

  it("uploads, scans, extracts, and blocks extraction before scan completes", async () => {
    const store = createEmptyMemoryStore();
    const { repos, userId, tenantId } = await ensureDemoUser(store);
    const queue = new InProcessQueueAdapter();
    const storage = new LocalFilesystemStorage(resolve(".data/test-uploads-2"), "test-secret-2");
    const service = ResumeImportService.fromRepos(repos, storage, queue);
    const ctx = context(userId, tenantId, repos);

    const pdf = minimalPdfBuffer("Jane Doe Software Engineer TypeScript React");
    const uploaded = await service.upload(ctx, {
      filename: "resume.pdf",
      mimeType: "application/pdf",
      size: pdf.byteLength,
      buffer: pdf,
    });
    expect(uploaded.file.scanStatus).toBe("pending");

    const file = await repos.files.getByPublicId(tenantId, uploaded.file.id);
    expect(file?.storageKey).not.toMatch(/^[A-Z]:\\/i);
    expect(file?.storageKey.startsWith("uploads/")).toBe(true);

    await expect(service.runExtraction(tenantId, uploaded.file.id)).rejects.toThrow(/malware scan/i);

    await service.runMalwareScan(tenantId, uploaded.file.id);
    await service.runExtraction(tenantId, uploaded.file.id);

    const status = await service.getImportStatus(ctx);
    expect(status.status).toBe("ready_for_review");
    expect(status.extraction?.skills.length).toBeGreaterThanOrEqual(0);
  });

  it("parses rendered PDF and DOCX fixtures", async () => {
    const pdf = minimalPdfBuffer("Alex Kim Experience Built APIs with Go");
    const docx = await createMinimalDocx(["Alex Kim", "Experience", "Built APIs with Go"]);

    const pdfText = await extractTextFromResume(pdf, "application/pdf");
    const docxText = await extractTextFromResume(docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    expect(pdfText.text).toMatch(/Alex Kim|API/i);
    expect(docxText.text).toMatch(/Alex Kim|API/i);

    const normalized = normalizeResumeText(`${pdfText.text}\nSkills\nGo, TypeScript`);
    expect(normalized.skills.map((s) => s.toLowerCase())).toEqual(expect.arrayContaining(["go"]));
  });

  it("reports parse failures for corrupted PDFs", async () => {
    await expect(extractTextFromResume(Buffer.from("not-a-real-pdf"), "application/pdf")).rejects.toThrow(/parse failed/i);
  });
});
