import { createHash } from "node:crypto";
import { CANDIDARC_CLASSIC_V1_TEMPLATE_ID } from "@/types/resume-document";
import { ResumeWorkStore, contentHash } from "../database/resume-work-store";
import { newId, type Repositories, type ResumeVersionRecord } from "../database/repositories";
import { AppError } from "../domain/types";
import type { ObjectStorage } from "../storage/types";
import { renderPdfAndDocx } from "./document-renderer";

/** Increment whenever rendering/template/fonts/output options change. No document styling changed here. */
export const EXPORT_RENDERER_VERSION = "classic-v1-renderer-2026-09-20.1";
type Format = "pdf" | "docx";
type RenderInput = Parameters<typeof renderPdfAndDocx>[0];
type ArtifactRenderer = (input: RenderInput) => Promise<Pick<Awaited<ReturnType<typeof renderPdfAndDocx>>, "pdfBuffer" | "docxBuffer" | "pageCount">>;
export type CachedArtifact = { key: string; fileId: string; size: number; checksum: string; pageCount: number; renderMs: number; reused: boolean };
export function exportIdentity(input: RenderInput, owner: string, format: Format): string {
  return contentHash({ tenant: input.tenantId, owner, version: input.resumeVersion.publicId,
    sections: input.resumeVersion.sections, contact: input.contact, candidateName: input.candidateName,
    template: CANDIDARC_CLASSIC_V1_TEMPLATE_ID, renderer: EXPORT_RENDERER_VERSION, format });
}

export async function exportFormat(input: RenderInput & { tenantId: string }, owner: string, format: Format,
  deps: { repos: Repositories; storage: ObjectStorage; render?: ArtifactRenderer }): Promise<CachedArtifact> {
  const store = new ResumeWorkStore(deps.repos, input.tenantId, owner);
  const identity = exportIdentity(input, owner, format);
  const key = `generated/${owner}/artifacts/${identity}/resume.${format}`;
  const fileId = `file-export-${identity}`;
  await store.put("export", identity, { key, fileId, versionId: input.resumeVersion.publicId,
    renderer: EXPORT_RENDERER_VERSION, format, protected: true });
  const complete = async (record: Record<string, unknown>): Promise<CachedArtifact | null> => {
    if (!record.checksum || !record.size) return null;
    const object = await deps.storage.headObject(input.tenantId, key);
    if (object?.checksum !== record.checksum || object.size !== record.size) return null;
    const existing = await deps.repos.files.getByPublicId(input.tenantId, fileId);
    if (!existing) await deps.repos.files.create({ id: newId("sf"), publicId: fileId, tenantId: input.tenantId,
      ownerUserId: owner, purpose: `customer-resume-${format}`, storageKey: key, mimeType: format === "pdf"
        ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: object.size, checksum: object.checksum, scanStatus: "clean", retentionState: "active" });
    return { key, fileId, size: object.size, checksum: object.checksum!, pageCount: Number(record.pageCount ?? 0), renderMs: Number(record.renderMs ?? 0), reused: true };
  };
  const token = await store.claim("export", identity, 300_000);
  if (!token) throw new AppError("EXPORT_IN_PROGRESS", "This download is already being prepared.", 409, undefined, true);
  let leaseLost = false;
  const heartbeat = setInterval(() => { void store.renew("export", identity, token, 300_000)
    .then(ok => { if (!ok) leaseLost = true; }).catch(() => { leaseLost = true; }); }, 30_000);
  try {
    const record = (await store.get("export", identity))!;
    const hit = await complete(record.data);
    if (hit) {
      await deps.repos.usage.append({ tenantId: input.tenantId, userId: owner, kind: "document_render", units: "1", costCents: "0",
        status: "committed", idempotencyKey: `export:${identity}`, metadata: { format, ...record.data, billable: false, computeCostMeasured: false } });
      return hit;
    }
    const start = performance.now();
    const rendered = await (deps.render ?? renderPdfAndDocx)({ ...input, formats: [format] });
    const buffer = format === "pdf" ? rendered.pdfBuffer : rendered.docxBuffer;
    if (!buffer) throw new AppError(format === "pdf" ? "PDF_RENDER_FAILED" : "DOCX_RENDER_FAILED",
      "This format could not be prepared. The saved resume is unchanged; retry this download.", 503, undefined, true);
    if (leaseLost) throw new AppError("EXPORT_LEASE_LOST", "Export ownership changed; retry download.", 409, undefined, true);
    const checksum = createHash("sha256").update(buffer).digest("hex");
    const recordData = { checksum, size: buffer.length, pageCount: rendered.pageCount, renderMs: Math.round(performance.now() - start) };
    // Record expected bytes first, so a crash after upload can reuse the object and repair metadata.
    if (!await store.patch("export", identity, recordData, token)) throw new AppError("EXPORT_LEASE_LOST", "Export ownership changed", 409);
    await deps.storage.putObject({ tenantId: input.tenantId, key, body: buffer, checksum,
      contentType: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const result = await complete(recordData);
    if (!result) throw new AppError("EXPORT_VERIFY_FAILED", "Stored document could not be verified", 503);
    await store.patch("export", identity, {}, token, "complete");
    await deps.repos.usage.append({ tenantId: input.tenantId, userId: owner, kind: "document_render", units: "1", costCents: "0",
      status: "committed", idempotencyKey: `export:${identity}`, metadata: { format, ...recordData, billable: false, computeCostMeasured: false } });
    return { ...result, reused: false };
  } finally { clearInterval(heartbeat); await store.release("export", identity, token); }
}

async function renderArtifactsLocked(deps: { repos: Repositories; storage: ObjectStorage },
  tenantId: string, applicationPublicId: string, version: ResumeVersionRecord, formats: Format[], assertLease: () => Promise<void>) {
  let app = await deps.repos.applications.getByPublicId(tenantId, applicationPublicId);
  const resume = await deps.repos.resumes.getByApplication(tenantId, applicationPublicId);
  if (!app?.ownerUserId || version.resumeId !== resume?.id) throw new AppError("EXPORT_SOURCE_INVALID", "Resume owner or version mismatch", 403);
  const currentId = app.metadata?.currentExportVersionId ?? resume.currentVersionPublicId;
  if (currentId && currentId !== version.publicId) return; // Stale queue delivery cannot publish older files.
  const prior = app.metadata?.customerFiles as Record<string, unknown> | undefined;
  const files: Record<string, unknown> = prior?.versionPublicId === version.publicId ? { ...prior } : { versionPublicId: version.publicId };
  const contact = {
    name: String(app.metadata?.candidateName ?? "Candidate"), email: app.metadata?.candidateEmail as string | undefined,
    phone: app.metadata?.candidatePhone as string | undefined, location: app.metadata?.candidateLocation as string | undefined,
    linkedIn: app.metadata?.candidateLinkedIn as string | undefined, github: app.metadata?.candidateGithub as string | undefined,
    portfolio: app.metadata?.candidatePortfolio as string | undefined,
  };
  const errors: Format[] = [];
  for (const format of formats) {
    try {
      const artifact = await exportFormat({ tenantId, applicationId: app.publicId, resumeVersion: version,
        candidateName: contact.name, contact, company: app.company, role: app.role }, app.ownerUserId!, format, deps);
      files[`${format}FileId`] = artifact.fileId; files[`${format}StorageKey`] = artifact.key; delete files[`${format}Error`];
      if (format === "pdf") files.pageCount = artifact.pageCount;
    } catch (error) {
      errors.push(format); files[`${format}Error`] = error instanceof AppError ? error.code : "DOCUMENT_RENDER_FAILED";
    }
  }
  files.pendingFormats = (["pdf", "docx"] as const).filter(f => !files[`${f}StorageKey`] || files[`${f}Error`]);
  app = (await deps.repos.applications.getByPublicId(tenantId, applicationPublicId))!;
  if ((app.metadata?.currentExportVersionId ?? version.publicId) !== version.publicId) return;
  const finals = (app.metadata?.customerFinalVersions ?? []) as string[];
  const anyReady = Boolean(files.pdfStorageKey || files.docxStorageKey);
  await assertLease();
  await deps.repos.applications.update(tenantId, app.publicId, {
    stage: anyReady ? "FINAL_READY" : "FAILED", workflowStage: anyReady ? "FINAL_READY" : "FAILED", status: anyReady ? "ready" : "failed",
    nextAction: errors.length ? "Retry download" : "Download resume", metadata: { ...app.metadata,
      currentExportVersionId: version.publicId, customerFiles: files,
      customerFinalVersions: finals.includes(version.publicId) ? finals : [...finals, version.publicId],
      documentRenderFailed: errors.length > 0, customerError: errors.length ? "A download could not be prepared. Retry the failed format; your resume is saved." : undefined,
      failedAtStage: errors.length ? "FINAL_QA_RUNNING" : undefined } });
  if (errors.length) throw new AppError("DOCUMENT_RENDER_FAILED", "Retry the failed document format", 503, undefined, true);
}

export async function renderCustomerArtifacts(deps: { repos: Repositories; storage: ObjectStorage },
  tenantId: string, applicationPublicId: string, version: ResumeVersionRecord, formats: Format[]) {
  const app = await deps.repos.applications.getByPublicId(tenantId, applicationPublicId);
  if (!app?.ownerUserId) throw new AppError("EXPORT_SOURCE_INVALID", "Resume owner is missing", 403);
  const store = new ResumeWorkStore(deps.repos, tenantId, app.ownerUserId);
  const key = `publish:${applicationPublicId}`;
  await store.put("export", key, { protected: true });
  const token = await store.claim("export", key, 600_000);
  if (!token) throw new AppError("EXPORT_IN_PROGRESS", "Downloads are already being prepared", 409, undefined, true);
  let leaseLost = false;
  const assertLease = async () => {
    if (leaseLost || !await store.renew("export", key, token, 600_000))
      throw new AppError("EXPORT_LEASE_LOST", "Export ownership changed; retry download.", 409, undefined, true);
  };
  const heartbeat = setInterval(() => { void assertLease().catch(() => { leaseLost = true; }); }, 30_000);
  try { await renderArtifactsLocked(deps, tenantId, applicationPublicId, version, formats, assertLease); }
  finally { clearInterval(heartbeat); await store.release("export", key, token); }
}
