import { createHash } from "crypto";

import type { AuthContext } from "../../auth/guards";

import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";

import type { Repositories } from "../../database/repositories";

import { newId } from "../../database/repositories";

import { AppError } from "../../domain/types";

import type { ObjectStorage } from "../../storage/types";

import type { QueueAdapter } from "../../workflows/queues";

import { ProfileService } from "../profile/service";
import { adaptResumeExtractionV1ToV2, type ResumeExtractionSection } from "./text-extractor";
import { mapPythonResumeParseToExtraction } from "./python-extraction-mapper";
import { getMalwareScanner } from "../../security/malware-scanner";
import {
  getPythonIntelligenceClient,
  mapPythonBackendErrorToAppError,
} from "../../intelligence/python-client";
import { logger } from "../../observability/logger";

export const MAX_RESUME_BYTES = 10 * 1024 * 1024;

/** Injected in unit tests so CI does not require a live FastAPI process. Production keeps the real probe. */
export type PythonReadyFn = () => Promise<boolean>;

function defaultPythonReady(): Promise<boolean> {
  return getPythonIntelligenceClient().ready();
}

export const ALLOWED_RESUME_MIMES = new Set([

  "application/pdf",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

]);

export const ALLOWED_RESUME_EXTENSIONS = new Set([".pdf", ".docx"]);

const CONFIRMED_BASELINE_KEY = "__confirmedBaseline";
const CONFIRMED_SOURCE_FILE_KEY = "__confirmedSourceFilePublicId";
const DRAFT_BASELINE_KEY = "__draftBaseline";

function asExtractionRecord(
  value: ResumeExtractionSection | Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readConfirmedBaseline(
  extraction: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!extraction || typeof extraction !== "object") return null;
  const baseline = extraction[CONFIRMED_BASELINE_KEY];
  if (!baseline || typeof baseline !== "object") return null;
  return baseline as Record<string, unknown>;
}

function readConfirmedSourceFilePublicId(
  extraction: Record<string, unknown> | null | undefined,
): string | null {
  if (!extraction || typeof extraction !== "object") return null;
  const value = extraction[CONFIRMED_SOURCE_FILE_KEY];
  return typeof value === "string" && value.trim() ? value : null;
}

function wrapWithConfirmedBaseline(
  confirmed: Record<string, unknown> | null,
  sourceFilePublicId?: string | null,
): Record<string, unknown> | null {
  if (!confirmed) return null;
  const {
    [CONFIRMED_BASELINE_KEY]: _ignoredBaseline,
    [CONFIRMED_SOURCE_FILE_KEY]: priorSource,
    error: _error,
    errorCode: _errorCode,
    replacementAttemptStatus: _attempt,
    confirmedProfileIntact: _intact,
    ...clean
  } = confirmed;
  void _ignoredBaseline;
  void _error;
  void _errorCode;
  void _attempt;
  void _intact;
  const source =
    (typeof sourceFilePublicId === "string" && sourceFilePublicId.trim()
      ? sourceFilePublicId
      : typeof priorSource === "string"
        ? priorSource
        : null) ?? null;
  return {
    [CONFIRMED_BASELINE_KEY]: clean,
    ...(source ? { [CONFIRMED_SOURCE_FILE_KEY]: source } : {}),
  };
}

function wrapWithDraftBaseline(
  prior: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!prior) return null;
  const { [CONFIRMED_BASELINE_KEY]: _c, [DRAFT_BASELINE_KEY]: _d, error: _e, errorCode: _code, ...clean } = prior;
  void _c;
  void _d;
  void _e;
  void _code;
  if (!Object.keys(clean).length) return null;
  return { [DRAFT_BASELINE_KEY]: clean };
}

function readDraftBaseline(extraction: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!extraction || typeof extraction !== "object") return null;
  const baseline = extraction[DRAFT_BASELINE_KEY];
  if (!baseline || typeof baseline !== "object") return null;
  return baseline as Record<string, unknown>;
}

function hasCareerContent(extraction: Record<string, unknown> | null): boolean {
  if (!extraction) return false;
  const employment = Array.isArray(extraction.employment) ? extraction.employment : [];
  const projects = Array.isArray(extraction.projects) ? extraction.projects : [];
  const skills = Array.isArray(extraction.skills) ? extraction.skills : [];
  return Boolean(employment.length || projects.length || skills.length || extraction.contact);
}

async function restoreConfirmedOrFail(
  repos: Repositories,
  tenantId: string,
  userId: string,
  extraction: Record<string, unknown> | null | undefined,
  errorCode: string,
  message: string,
) {
  const baseline = readConfirmedBaseline(extraction);
  if (baseline) {
    const confirmedSource = readConfirmedSourceFilePublicId(extraction);
    // Keep confirmed career fields usable while recording the failed replacement attempt.
    await repos.candidateProfiles.update(tenantId, userId, {
      resumeImportStatus: "failed",
      ...(confirmedSource ? { sourceResumeFilePublicId: confirmedSource } : {}),
      resumeImportExtraction: {
        ...baseline,
        [CONFIRMED_BASELINE_KEY]: baseline,
        ...(confirmedSource ? { [CONFIRMED_SOURCE_FILE_KEY]: confirmedSource } : {}),
        error: message,
        errorCode,
        replacementAttemptStatus: "failed",
        confirmedProfileIntact: true,
      },
    });
    return;
  }
  const draft = readDraftBaseline(extraction);
  if (draft && hasCareerContent(draft)) {
    await repos.candidateProfiles.update(tenantId, userId, {
      resumeImportStatus: "failed",
      resumeImportExtraction: {
        ...draft,
        error: message,
        errorCode,
        replacementAttemptStatus: "failed",
      },
    });
    return;
  }
  await repos.candidateProfiles.update(tenantId, userId, {
    resumeImportStatus: "failed",
    resumeImportExtraction: {
      error: message,
      errorCode,
      replacementAttemptStatus: "failed",
      confirmedProfileIntact: false,
    },
  });
}

export type ResumeUploadInput = {

  filename: string;

  mimeType: string;

  size: number;

  buffer: Buffer;

};

function importEvidencePublicId(filePublicId: string, kind: "emp" | "proj" | "cert" | "edu" | "pub", index: number): string {

  const digest = createHash("sha256").update(`${filePublicId}:${kind}:${index}`).digest("hex").slice(0, 20);

  return `evp-import-${digest}`;

}

export class ResumeImportService {

  constructor(

    private readonly repos: Repositories,

    private readonly storage: ObjectStorage,

    private readonly queue: QueueAdapter,

    private readonly profiles: ProfileService,

    private readonly pythonReady: PythonReadyFn = defaultPythonReady,

  ) {}

  static fromRepos(
    repos: Repositories,
    storage: ObjectStorage,
    queue: QueueAdapter,
    pythonReady: PythonReadyFn = defaultPythonReady,
  ) {

    return new ResumeImportService(repos, storage, queue, ProfileService.fromRepos(repos), pythonReady);

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

    if (ext === ".doc") {

      throw new AppError(

        "LEGACY_DOC_UNSUPPORTED",

        "Legacy .doc Word files are not supported. Open the file in Microsoft Word and Save As DOCX (.docx), then upload again.",

        400,

      );

    }

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

    try {

      const ready = await this.pythonReady();

      if (!ready) {

        throw new AppError(

          "RESUME_PARSE_PIPELINE_UNAVAILABLE",

          "Resume parsing is unavailable. Start the complete demo with `npm run dev` (Next.js + FastAPI + worker), then retry. Web-only: `npm run dev:web`.",

          503,

          undefined,

          true,

        );

      }

    } catch (err) {

      if (err instanceof AppError) throw err;

      throw new AppError(

        "RESUME_PARSE_PIPELINE_UNAVAILABLE",

        "Resume parsing is unavailable. Start the complete demo with `npm run dev` (Next.js + FastAPI + worker), then retry. Web-only: `npm run dev:web`.",

        503,

        undefined,

        true,

      );

    }

    await this.profiles.getOrCreate(ctx);

    const existing = await this.profiles.get(ctx);
    const priorExtraction = asExtractionRecord(existing.resumeImportExtraction as Record<string, unknown> | null);
    const confirmedBaseline =
      existing.resumeImportStatus === "confirmed" && priorExtraction
        ? wrapWithConfirmedBaseline(priorExtraction, existing.sourceResumeFilePublicId)
        : readConfirmedBaseline(priorExtraction)
          ? wrapWithConfirmedBaseline(
              {
                ...readConfirmedBaseline(priorExtraction)!,
                [CONFIRMED_SOURCE_FILE_KEY]:
                  readConfirmedSourceFilePublicId(priorExtraction) ?? existing.sourceResumeFilePublicId,
              },
              readConfirmedSourceFilePublicId(priorExtraction) ?? existing.sourceResumeFilePublicId,
            )
          : null;
    const draftBaseline =
      !confirmedBaseline && hasCareerContent(priorExtraction) ? wrapWithDraftBaseline(priorExtraction) : null;

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

      // Keep confirmed extraction baseline so a failed replacement cannot wipe career data.
      resumeImportExtraction: confirmedBaseline ?? draftBaseline,

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

      extraction: adaptResumeExtractionV1ToV2(
        (() => {
          const raw = profile.resumeImportExtraction as Record<string, unknown> | null;
          if (!raw) return null;
          // In-progress replacement: baseline only, no error yet — do not stage as ready review.
          if (CONFIRMED_BASELINE_KEY in raw && !raw.employment && !raw.error) {
            return null;
          }
          if (DRAFT_BASELINE_KEY in raw && !raw.employment && !raw.error) {
            return null;
          }
          return raw as ResumeExtractionSection | null;
        })(),
      ),

      file,

      // Explicit attempt vs usable-profile signals for clients and regression tests.
      replacementAttemptStatus:
        ((profile.resumeImportExtraction as Record<string, unknown> | null)?.replacementAttemptStatus as
          | string
          | undefined) ?? null,
      confirmedProfileIntact: Boolean(
        (profile.resumeImportExtraction as Record<string, unknown> | null)?.confirmedProfileIntact,
      ),

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
    void skills;

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

        technologies: job.technologies?.length ? job.technologies : [],

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

          sourceOrder: job.sourceOrder ?? index,

          attestation: "candidate_confirmation",

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

        technologies: project.technologies.length ? project.technologies : [],

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

          attestation: "candidate_confirmation",

        },

        sourceType: "resume-import-project",

        claimText: description,

        evidenceStatus: "active",

        candidateConfirmationStatus: "confirmed",

        projectAssociation: title,

      });

    }

    const certRows =
      extraction.certificationEntries?.length
        ? extraction.certificationEntries
        : (extraction.certifications ?? []).map((name) => ({
            name: typeof name === "string" ? name : "",
          }));

    for (const [index, certification] of certRows.entries()) {
      const name = (certification.name ?? "").trim();
      if (!name) continue;

      const publicId = importEvidencePublicId(filePublicId, "cert", index);

      const existing = await this.repos.evidence.getByPublicId(tenantId, publicId);

      if (existing) continue;

      const issuer =
        "issuer" in certification && typeof certification.issuer === "string"
          ? certification.issuer
          : undefined;

      await this.repos.evidence.create({

        id: newId("ev"),

        publicId,

        tenantId,

        ownerUserId: userId,

        candidateProfileId,

        title: name.trim(),

        organization: issuer || "Certification attestation",

        situation: `Candidate reported certification: ${name.trim()}`,

        task: "Provide supporting evidence or keep as attestation-only until confirmed",

        actions: ["Candidate attestation recorded during resume import"],

        result: "Pending independent verification; treat as candidate attestation only",

        technologies: [],

        confidence: "low",

        verificationStatus: "user_attested",

        privacyLevel: "share-safe",

        excludedFromApplicationIds: [],

        matchedApplicationIds: [],

        payload: {

          source: "resume-import",

          filePublicId,

          kind: "certification",

          index,

          attestationRequired: true,

          independentlyVerified: false,

          issuer,

        },

        sourceType: "certification-attestation",

        claimText: name.trim(),

        evidenceStatus: "attestation_pending",

        candidateConfirmationStatus: "attested",

      });

    }

    for (const [index, edu] of (extraction.education ?? []).entries()) {
      const label = [edu.degree, edu.institution].filter(Boolean).join(" — ") || `Education ${index + 1}`;
      const publicId = importEvidencePublicId(filePublicId, "edu", index);
      const existing = await this.repos.evidence.getByPublicId(tenantId, publicId);
      if (existing) continue;
      await this.repos.evidence.create({
        id: newId("ev"),
        publicId,
        tenantId,
        ownerUserId: userId,
        candidateProfileId,
        title: label,
        organization: edu.institution ?? "",
        situation: label,
        task: edu.field ? `Field of study: ${edu.field}` : "Education attestation from resume import",
        actions: [],
        result: [edu.endDate, edu.gpa ? `GPA ${edu.gpa}` : null, edu.honors].filter(Boolean).join(" · ") || label,
        technologies: [],
        confidence: "medium",
        verificationStatus: "user_attested",
        privacyLevel: "share-safe",
        excludedFromApplicationIds: [],
        matchedApplicationIds: [],
        payload: {
          source: "resume-import",
          filePublicId,
          kind: "education",
          index,
          attestation: "candidate_confirmation",
        },
        sourceType: "resume-import-education",
        claimText: label,
        evidenceStatus: "active",
        candidateConfirmationStatus: "confirmed",
      });
    }

    for (const [index, publication] of (extraction.publications ?? []).entries()) {
      const title = publication.title?.trim();
      if (!title) continue;
      const publicId = importEvidencePublicId(filePublicId, "pub", index);
      const existing = await this.repos.evidence.getByPublicId(tenantId, publicId);
      if (existing) continue;
      await this.repos.evidence.create({
        id: newId("ev"),
        publicId,
        tenantId,
        ownerUserId: userId,
        candidateProfileId,
        title,
        organization: publication.publisher || "Publication attestation",
        situation: publication.description || title,
        task: "Treat as candidate attestation until independently verified",
        actions: publication.authors?.length ? [`Authors: ${publication.authors.join(", ")}`] : [],
        result: "Pending independent verification; treat as candidate attestation only",
        technologies: [],
        confidence: "low",
        verificationStatus: "user_attested",
        privacyLevel: "share-safe",
        excludedFromApplicationIds: [],
        matchedApplicationIds: [],
        payload: {
          source: "resume-import",
          filePublicId,
          kind: "publication",
          index,
          independentlyVerified: false,
          doi: publication.doi,
          url: publication.url,
          attestationRequired: true,
        },
        sourceType: "publication-attestation",
        claimText: title,
        evidenceStatus: "attestation_pending",
        candidateConfirmationStatus: "attested",
      });
    }

  }

  async confirmImport(ctx: AuthContext) {

    const user = requireUser(ctx);

    const tenantId = this.tenantId(ctx);

    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    const profile = await this.profiles.get(ctx);

    const extraction = adaptResumeExtractionV1ToV2(
      profile.resumeImportExtraction as ResumeExtractionSection | null,
    );

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

    const raw = profile.resumeImportExtraction as Record<string, unknown> | null;
    const {
      [CONFIRMED_BASELINE_KEY]: _baseline,
      [CONFIRMED_SOURCE_FILE_KEY]: _source,
      [DRAFT_BASELINE_KEY]: _draft,
      error: _error,
      errorCode: _errorCode,
      replacementAttemptStatus: _attempt,
      confirmedProfileIntact: _intact,
      ...confirmedExtraction
    } = (raw ?? {}) as Record<string, unknown>;
    void _baseline;
    void _source;
    void _draft;
    void _error;
    void _errorCode;
    void _attempt;
    void _intact;

    const patch: Record<string, unknown> = {

      resumeImportStatus: "confirmed",

      resumeImportExtraction: confirmedExtraction,

    };

    if (contact.fullName) patch.fullName = contact.fullName;

    if (contact.email) patch.email = contact.email;

    if (contact.phone) patch.phone = contact.phone;

    if (contact.location) patch.location = contact.location;

    if (contact.linkedIn) patch.linkedIn = contact.linkedIn;

    if (contact.github) patch.github = contact.github;

    if (contact.portfolio) patch.portfolio = contact.portfolio;

    if (extraction.professionalSummary) patch.summary = extraction.professionalSummary;

    if (extraction.skills.length && !profile.headline && extraction.employment[0]?.title) {

      patch.headline = extraction.employment[0].title;

    }

    const confirmedExtractionSection =
      adaptResumeExtractionV1ToV2(confirmedExtraction as ResumeExtractionSection) ?? extraction;

    const updated = await this.repos.candidateProfiles.update(tenantId, user.id, patch);

    await this.createImportEvidence(
      tenantId,
      user.id,
      updated.id,
      filePublicId,
      confirmedExtractionSection,
    );

    return { profile: updated, extraction: confirmedExtractionSection };

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
        await restoreConfirmedOrFail(
          this.repos,
          tenantId,
          profile.userId,
          profile.resumeImportExtraction as Record<string, unknown> | null,
          "MALWARE_DETECTED",
          scan.detail ?? "Malware detected in uploaded file",
        );
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

    // Superseded by a newer upload — never write late results onto the current import.
    if (profile.sourceResumeFilePublicId && profile.sourceResumeFilePublicId !== filePublicId) {
      logger.info({ tenantId, filePublicId }, "skipping extraction for superseded import");
      return;
    }

    // Replacements always run; confirmed data is preserved via baseline wrapping on upload.
    if (profile.resumeImportStatus === "confirmed" && profile.sourceResumeFilePublicId !== filePublicId) {
      logger.info({ tenantId, filePublicId }, "skipping extraction for already-confirmed import");
      return;
    }

    await this.repos.candidateProfiles.update(tenantId, profile.userId, {
      resumeImportStatus: "extracting",
    });

    try {
      const object = await this.storage.getObject(tenantId, file.storageKey);
      if (!object) throw new AppError("FILE_NOT_FOUND", "Stored resume object missing", 404);

      const contentBase64 = object.body.toString("base64");
      let parsed;
      try {
        parsed = await getPythonIntelligenceClient().parseResume({
          context: {
            tenantId,
            userId: profile.userId,
            requestId: `resume-import:${filePublicId}`,
          },
          filename:
            file.storageKey.endsWith(".docx") || file.mimeType.includes("word")
              ? `${file.publicId}.docx`
              : `${file.publicId}.pdf`,
          contentType: file.mimeType,
          contentBase64,
        });
      } catch (err) {
        throw mapPythonBackendErrorToAppError(err);
      }

      const extraction = mapPythonResumeParseToExtraction(parsed);
      if (!extraction.rawText.trim() && !(extraction.usable ?? false)) {
        throw new AppError("PARSE_FAILED", "Could not extract text from resume", 422);
      }

      const latest = await this.repos.candidateProfiles.getByUser(tenantId, profile.userId);
      if (!latest || latest.sourceResumeFilePublicId !== filePublicId) {
        logger.info({ tenantId, filePublicId }, "skipping stale extraction write after newer upload");
        return;
      }

      const priorBaseline = readConfirmedBaseline(
        latest.resumeImportExtraction as Record<string, unknown> | null,
      );
      const priorSource = readConfirmedSourceFilePublicId(
        latest.resumeImportExtraction as Record<string, unknown> | null,
      );
      const nextExtraction = {
        ...(extraction as unknown as Record<string, unknown>),
        ...(priorBaseline ? { [CONFIRMED_BASELINE_KEY]: priorBaseline } : {}),
        ...(priorSource ? { [CONFIRMED_SOURCE_FILE_KEY]: priorSource } : {}),
      };

      await this.repos.candidateProfiles.update(tenantId, profile.userId, {
        resumeImportStatus: "ready_for_review",
        resumeImportExtraction: nextExtraction,
      });
    } catch (err) {
      const latest = await this.repos.candidateProfiles.getByUser(tenantId, profile.userId);
      if (!latest || latest.sourceResumeFilePublicId !== filePublicId) {
        logger.info({ tenantId, filePublicId }, "skipping stale extraction failure after newer upload");
        throw err;
      }
      const code = err instanceof AppError ? err.code : "PARSE_FAILED";
      const message =
        err instanceof AppError
          ? err.message
          : "We couldn’t read that resume. Try a text-based PDF or DOCX, or enter details manually.";
      await restoreConfirmedOrFail(
        this.repos,
        tenantId,
        profile.userId,
        latest.resumeImportExtraction as Record<string, unknown> | null,
        code,
        message,
      );
      throw err;
    }
  }

  /** Mark import failed after queue retries are exhausted (terminal). */
  async markImportFailed(tenantId: string, filePublicId: string, errorCode: string, message: string) {
    const profile = await this.repos.candidateProfiles.findBySourceResumeFile(tenantId, filePublicId);
    if (!profile?.userId) return;
    if (profile.resumeImportStatus === "confirmed") return;
    await restoreConfirmedOrFail(
      this.repos,
      tenantId,
      profile.userId,
      profile.resumeImportExtraction as Record<string, unknown> | null,
      errorCode,
      message,
    );
  }
}

