import { createHash } from "crypto";

import type { AuthContext } from "../../auth/guards";

import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";

import type { Repositories } from "../../database/repositories";

import { newId } from "../../database/repositories";

import { AppError } from "../../domain/types";

import type { ObjectStorage } from "../../storage/types";

import type { QueueAdapter } from "../../workflows/queues";

import { ProfileService } from "../profile/service";

import { extractTextFromResume, normalizeResumeText, type ResumeExtractionSection } from "./text-extractor";
import { getMalwareScanner } from "../../security/malware-scanner";



export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

export const ALLOWED_RESUME_MIMES = new Set([

  "application/pdf",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

]);

export const ALLOWED_RESUME_EXTENSIONS = new Set([".pdf", ".docx"]);



export type ResumeUploadInput = {

  filename: string;

  mimeType: string;

  size: number;

  buffer: Buffer;

};



function importEvidencePublicId(filePublicId: string, kind: "emp" | "proj", index: number): string {

  const digest = createHash("sha256").update(`${filePublicId}:${kind}:${index}`).digest("hex").slice(0, 20);

  return `evp-import-${digest}`;

}



export class ResumeImportService {

  constructor(

    private readonly repos: Repositories,

    private readonly storage: ObjectStorage,

    private readonly queue: QueueAdapter,

    private readonly profiles: ProfileService,

  ) {}



  static fromRepos(repos: Repositories, storage: ObjectStorage, queue: QueueAdapter) {

    return new ResumeImportService(repos, storage, queue, ProfileService.fromRepos(repos));

  }



  private tenantId(ctx: AuthContext) {

    requireUser(ctx);

    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);

    requireTenantMembership(ctx, ctx.activeTenantId);

    return ctx.activeTenantId;

  }



  validateUpload(input: ResumeUploadInput) {

    const ext = input.filename.includes(".")

      ? `.${input.filename.split(".").pop()!.toLowerCase()}`

      : "";

    if (!ALLOWED_RESUME_EXTENSIONS.has(ext)) {

      throw new AppError("INVALID_FILE_TYPE", "Only PDF and DOCX resumes are supported", 400);

    }

    if (!ALLOWED_RESUME_MIMES.has(input.mimeType)) {

      throw new AppError("INVALID_MIME_TYPE", "Invalid resume MIME type", 400);

    }

    if (!input.buffer.byteLength) {

      throw new AppError("EMPTY_FILE", "Uploaded file is empty", 400);

    }

    if (input.size <= 0) {

      throw new AppError("EMPTY_FILE", "Uploaded file is empty", 400);

    }

    if (input.size > MAX_RESUME_BYTES || input.buffer.byteLength > MAX_RESUME_BYTES) {

      throw new AppError("FILE_TOO_LARGE", `Resume must be under ${MAX_RESUME_BYTES / (1024 * 1024)}MB`, 400);

    }

    if (ext === ".pdf" && !input.buffer.subarray(0, 4).equals(Buffer.from("%PDF"))) {

      throw new AppError("CORRUPT_FILE", "File does not appear to be a valid PDF", 400);

    }

    if (ext === ".docx" && input.buffer.subarray(0, 2).toString("hex") !== "504b") {

      throw new AppError("CORRUPT_FILE", "File does not appear to be a valid DOCX", 400);

    }

  }



  async upload(ctx: AuthContext, input: ResumeUploadInput) {

    const user = requireUser(ctx);

    const tenantId = this.tenantId(ctx);

    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    this.validateUpload(input);



    await this.profiles.getOrCreate(ctx);



    const filePublicId = newId("sfp");

    const storageKey = `uploads/${user.publicId}/${filePublicId}${input.filename.endsWith(".docx") ? ".docx" : ".pdf"}`;

    const checksum = createHash("sha256").update(input.buffer).digest("hex");



    await this.storage.putObject({

      tenantId,

      key: storageKey,

      body: input.buffer,

      contentType: input.mimeType,

      checksum,

    });



    const file = await this.repos.files.create({

      id: newId("sf"),

      publicId: filePublicId,

      tenantId,

      ownerUserId: user.id,

      purpose: "resume-import",

      storageKey,

      mimeType: input.mimeType,

      size: input.buffer.byteLength,

      checksum,

      scanStatus: "pending",

      retentionState: "active",

    });



    await this.repos.candidateProfiles.update(tenantId, user.id, {

      sourceResumeFilePublicId: file.publicId,

      resumeImportStatus: "pending_scan",

      resumeImportExtraction: null,

    });



    await this.queue.enqueue(

      "maintenance",

      "files.malware_scan",

      { tenantId, filePublicId: file.publicId },

      { idempotencyKey: `scan:${file.publicId}` },

    );



    return {

      file: {

        id: file.publicId,

        purpose: file.purpose,

        mimeType: file.mimeType,

        size: file.size,

        scanStatus: file.scanStatus,

      },

      importStatus: "pending_scan" as const,

    };

  }



  async getImportStatus(ctx: AuthContext) {

    const profile = await this.profiles.get(ctx);

    let file = null;

    if (profile.sourceResumeFilePublicId) {

      const tenantId = this.tenantId(ctx);

      const stored = await this.repos.files.getByPublicId(tenantId, profile.sourceResumeFilePublicId);

      if (stored) {

        file = {

          id: stored.publicId,

          scanStatus: stored.scanStatus,

          mimeType: stored.mimeType,

          size: stored.size,

        };

      }

    }

    return {

      status: profile.resumeImportStatus,

      extraction: profile.resumeImportExtraction as ResumeExtractionSection | null,

      file,

    };

  }



  async updateExtraction(ctx: AuthContext, extraction: ResumeExtractionSection) {

    const user = requireUser(ctx);

    const tenantId = this.tenantId(ctx);

    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    const profile = await this.profiles.get(ctx);

    if (profile.resumeImportStatus === "confirmed") {

      throw new AppError("IMPORT_ALREADY_CONFIRMED", "Resume import is already confirmed", 409);

    }

    if (profile.resumeImportStatus !== "ready_for_review") {

      throw new AppError("IMPORT_NOT_READY", "Resume import is not ready for editing", 409);

    }

    await this.repos.candidateProfiles.update(tenantId, user.id, {

      resumeImportExtraction: extraction as unknown as Record<string, unknown>,

    });

    return { extraction };

  }



  private async createImportEvidence(

    tenantId: string,

    userId: string,

    candidateProfileId: string,

    filePublicId: string,

    extraction: ResumeExtractionSection,

  ) {

    const skills = extraction.skills ?? [];

    for (const [index, job] of extraction.employment.entries()) {

      const publicId = importEvidencePublicId(filePublicId, "emp", index);

      const existing = await this.repos.evidence.getByPublicId(tenantId, publicId);

      if (existing) continue;



      const title = [job.title, job.company].filter(Boolean).join(" at ") || `Role ${index + 1}`;

      const situation = job.bullets[0] ?? `Worked as ${title}`;

      const actions = job.bullets.slice(1);

      const dateRange = [job.startDate, job.endDate].filter(Boolean).join(" – ");



      await this.repos.evidence.create({

        id: newId("ev"),

        publicId,

        tenantId,

        ownerUserId: userId,

        candidateProfileId,

        title,

        organization: job.company ?? "",

        situation,

        task: `Deliver results as ${job.title ?? "individual contributor"}${dateRange ? ` (${dateRange})` : ""}`,

        actions,

        result: job.bullets.at(-1) ?? situation,

        technologies: skills,

        confidence: "medium",

        verificationStatus: "user_attested",

        privacyLevel: "share-safe",

        excludedFromApplicationIds: [],

        matchedApplicationIds: [],

        payload: {

          source: "resume-import",

          filePublicId,

          kind: "employment",

          index,

          location: job.location,

        },

      });

    }



    for (const [index, project] of extraction.projects.entries()) {

      const publicId = importEvidencePublicId(filePublicId, "proj", index);

      const existing = await this.repos.evidence.getByPublicId(tenantId, publicId);

      if (existing) continue;



      const title = project.name ?? `Project ${index + 1}`;

      const description = project.description ?? title;



      await this.repos.evidence.create({

        id: newId("ev"),

        publicId,

        tenantId,

        ownerUserId: userId,

        candidateProfileId,

        title,

        organization: "Personal project",

        situation: description,

        task: "Design and deliver the project outcome",

        actions: project.technologies.length ? [`Used ${project.technologies.join(", ")}`] : [],

        result: description,

        technologies: project.technologies.length ? project.technologies : skills,

        confidence: "medium",

        verificationStatus: "user_attested",

        privacyLevel: "share-safe",

        excludedFromApplicationIds: [],

        matchedApplicationIds: [],

        payload: {

          source: "resume-import",

          filePublicId,

          kind: "project",

          index,

        },

      });

    }

  }



  async confirmImport(ctx: AuthContext) {

    const user = requireUser(ctx);

    const tenantId = this.tenantId(ctx);

    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    const profile = await this.profiles.get(ctx);

    const extraction = profile.resumeImportExtraction as ResumeExtractionSection | null;

    if (!extraction) {

      throw new AppError("IMPORT_NOT_READY", "No resume extraction available to confirm", 409);

    }



    if (profile.resumeImportStatus === "confirmed") {

      return { profile, extraction };

    }



    if (profile.resumeImportStatus !== "ready_for_review") {

      throw new AppError("IMPORT_NOT_READY", "Resume import is not ready for confirmation", 409);

    }



    const filePublicId = profile.sourceResumeFilePublicId;

    if (!filePublicId) {

      throw new AppError("IMPORT_NOT_READY", "No source resume file linked to this profile", 409);

    }



    const contact = extraction.contact ?? {};

    const patch: Record<string, unknown> = {

      resumeImportStatus: "confirmed",

    };

    if (contact.fullName) patch.fullName = contact.fullName;

    if (contact.email) patch.email = contact.email;

    if (contact.phone) patch.phone = contact.phone;

    if (contact.location) patch.location = contact.location;

    if (contact.linkedIn) patch.linkedIn = contact.linkedIn;

    if (contact.github) patch.github = contact.github;

    if (contact.portfolio) patch.portfolio = contact.portfolio;

    if (extraction.skills.length && !profile.headline && extraction.employment[0]?.title) {

      patch.headline = extraction.employment[0].title;

    }



    const updated = await this.repos.candidateProfiles.update(tenantId, user.id, patch);

    await this.createImportEvidence(tenantId, user.id, updated.id, filePublicId, extraction);

    return { profile: updated, extraction };

  }



  async runMalwareScan(tenantId: string, filePublicId: string) {
    const file = await this.repos.files.getByPublicId(tenantId, filePublicId);
    if (!file || file.deletedAt) return;
    if (file.scanStatus !== "pending") return;

    const object = await this.storage.getObject(tenantId, file.storageKey);
    if (!object) {
      await this.repos.files.update(tenantId, filePublicId, { scanStatus: "failed" });
      return;
    }

    const scan = await getMalwareScanner().scan(object.body);
    if (!scan.clean) {
      await this.repos.files.update(tenantId, filePublicId, { scanStatus: "infected" });
      const profile = await this.repos.candidateProfiles.findBySourceResumeFile(tenantId, filePublicId);
      if (profile?.userId) {
        await this.repos.candidateProfiles.update(tenantId, profile.userId, {
          resumeImportStatus: "failed",
          resumeImportExtraction: { error: scan.detail ?? "Malware detected in uploaded file" },
        });
      }
      return;
    }

    await this.repos.files.update(tenantId, filePublicId, { scanStatus: "clean" });

    const profile = await this.repos.candidateProfiles.findBySourceResumeFile(tenantId, filePublicId);
    if (profile?.userId) {
      await this.repos.candidateProfiles.update(tenantId, profile.userId, {
        resumeImportStatus: "scan_clean",
      });
    }

    await this.queue.enqueue(
      "document-parsing",
      "resume.extract",
      { tenantId, filePublicId },
      { idempotencyKey: `extract:${filePublicId}` },
    );
  }



  async runExtraction(tenantId: string, filePublicId: string) {

    const file = await this.repos.files.getByPublicId(tenantId, filePublicId);

    if (!file || file.deletedAt) return;

    if (file.scanStatus !== "clean") {

      throw new AppError("SCAN_REQUIRED", "Resume must pass malware scan before extraction", 409);

    }



    const profile = await this.repos.candidateProfiles.findBySourceResumeFile(tenantId, filePublicId);

    if (!profile?.userId) return;



    await this.repos.candidateProfiles.update(tenantId, profile.userId, {

      resumeImportStatus: "extracting",

    });



    try {

      const object = await this.storage.getObject(tenantId, file.storageKey);

      if (!object) throw new AppError("FILE_NOT_FOUND", "Stored resume object missing", 404);



      const { text, warnings } = await extractTextFromResume(object.body, file.mimeType);

      if (!text.trim()) {

        throw new AppError("PARSE_FAILED", "Could not extract text from resume", 422);

      }

      const parsed = normalizeResumeText(text, warnings);



      await this.repos.candidateProfiles.update(tenantId, profile.userId, {

        resumeImportStatus: "ready_for_review",

        resumeImportExtraction: parsed as unknown as Record<string, unknown>,

      });

    } catch (err) {

      await this.repos.candidateProfiles.update(tenantId, profile.userId, {

        resumeImportStatus: "failed",

        resumeImportExtraction: {

          error: err instanceof Error ? err.message : "Extraction failed",

        },

      });

      throw err;

    }

  }

}


