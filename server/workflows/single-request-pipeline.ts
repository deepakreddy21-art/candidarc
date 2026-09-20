import { CANDIDARC_CLASSIC_V1_TEMPLATE_ID } from "@/types/resume-document";
import { ResumeWorkStore } from "../database/resume-work-store";
import { newId, type WorkflowRunRecord } from "../database/repositories";
import { AppError } from "../domain/types";
import { getPythonIntelligenceClient } from "../intelligence/python-client";
import { type ResearchCollection } from "../research/team-collector";
import { collectDurably } from "../research/durable-collection";
import { isPlaceholderIdentity } from "../resumes/job-extraction";
import type { ResumePipelineDeps } from "./resume-pipeline";
import { computeCandidArcQualityScore, qualityContactFromSnapshot, attachQualityProvenance } from "../resumes/quality-score";
import { resumeSchema } from "../ai/schemas";

export async function preserveLegacyCustomerRun(deps: ResumePipelineDeps, run: WorkflowRunRecord) {
  // There is no reliable way to know whether an old in-flight paid call happened.
  // Keep every document; never infer an unused new allowance from an old queue message.
  const app = await deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
  if (!app || app.workflowStage === "FINAL_READY") return;
  await deps.workflows.updateRun(run.id, { status: "waiting_review", payload: { ...run.payload, legacyMigrationRequired: true } });
  await deps.applications.update(run.tenantId, app.publicId, { nextAction: "Review saved resume", metadata: {
    ...app.metadata, customerError: "This earlier workflow has been paused. Saved versions are preserved; support can recover its last response without another paid request.",
    legacyMigrationRequired: true,
  } });
}

export async function runSingleRequestStage(deps: ResumePipelineDeps, run: WorkflowRunRecord) {
  let app = await deps.applications.getByPublicId(run.tenantId, run.applicationPublicId);
  if (!app?.ownerUserId) throw new AppError("OWNER_REQUIRED", "Resume owner is missing", 422);
  const store = new ResumeWorkStore(deps, run.tenantId, app.ownerUserId);
  const operationId = String(run.payload.generationOperationId);
  const op = await store.get("operation", operationId);
  if (!op) throw new AppError("OPERATION_NOT_RESERVED", "Generation operation is missing", 409);
  const profile = await store.get("profile", String(op.data.profileKey));
  const job = await store.get("job", String(op.data.jobKey));
  if (!profile || !job) throw new AppError("SNAPSHOT_MISSING", "Saved generation inputs are missing", 409);
  const evidence = profile.data.evidence as Array<Record<string, unknown>>;
  const jobDescription = String(job.data.jobDescription ?? "");
  const client = getPythonIntelligenceClient();
  const context = { tenantId: run.tenantId, userId: app.ownerUserId, applicationId: app.publicId, workflowRunId: run.publicId, requestId: run.traceId ?? run.publicId };
  if (run.stage === "RESEARCH_QUEUED" || run.stage === "RESEARCH_RUNNING") {
    if (run.stage === "RESEARCH_QUEUED") await deps.engine.transition(run.id, "RESEARCH_RUNNING", { message: "Reading job details and public sources" });
    if (!op.data.researchKey) {
      const parsed = await client.parseJob({ context, jobText: jobDescription,
        company: isPlaceholderIdentity(app.company, app.role) ? undefined : app.company,
        role: isPlaceholderIdentity(app.company, app.role) ? undefined : app.role });
      const company = parsed.company || app.company;
      const role = parsed.role || parsed.title || app.role;
      // Unknown identity must not become a misleading public-source query.
      const gathered = isPlaceholderIdentity(company, role)
        ? { key: `unknown:${operationId}`, collection: { key: operationId, collectedAt: new Date().toISOString(), cached: false, status: "unavailable", sources: [],
          notice: "Company or role could not be identified. Tailoring uses the supplied job description; add company and role for public research." } as ResearchCollection }
        : await collectDurably(deps, run.tenantId, app.ownerUserId!, { company, role, jobDescription,
          jobUrl: job.data.jobUrl as string | undefined, team: job.data.team as string | undefined,
          product: job.data.product as string | undefined, businessUnit: job.data.businessUnit as string | undefined,
          researchDepth: "deep-team" });
      const research = gathered.collection;
      await store.put("research", gathered.key, { collection: research });
      await store.patch("operation", operationId, { researchKey: gathered.key, jobRequirements: [...(parsed.required_qualifications ?? []), ...(parsed.responsibilities ?? [])] });
      app = await deps.applications.update(run.tenantId, app.publicId, { company, role, metadata: {
        ...app.metadata, jobRequirements: [...(parsed.required_qualifications ?? []), ...(parsed.responsibilities ?? [])],
        knownTechnologies: [...new Set(evidence.flatMap(e => (e.technologies ?? []) as string[]))], researchCollection: { ...research, sources: research.sources.map(source => ({ url: source.url, title: source.title, accessedAt: source.accessedAt, confidence: source.confidence, type: source.type })) }, researchNotice: research.notice, jobExtractionAppliedAt: new Date().toISOString(),
      } });
    }
    await deps.applications.update(run.tenantId, app.publicId, { stage: "V0_GENERATING", workflowStage: "V0_GENERATING" });
    await deps.engine.transition(run.id, "V0_GENERATING", { message: "Preparing the initial resume" });
    return;
  }
  if (run.stage === "V0_GENERATING") {
    const key = `${run.tenantId}:single:${operationId}:resume_generation`;
    await deps.usage.append({ tenantId: run.tenantId, userId: app.ownerUserId, kind: "resume_generation", units: "1", costCents: "0",
      workflowRunId: run.id, idempotencyKey: key, status: "reserved", metadata: { operationId, policy: "single-request-v1" } });
    const research = (await store.get("research", String(op.data.researchKey)))?.data.collection as ResearchCollection | undefined;
    // Python's durable allowance handles duplicate delivery even if this worker loses its lease.
    const result = await client.generateResumeOnce({ context, absoluteVersion: 0, cycleStep: 0,
      operationId, evidence, jobDescription, allowedTechnologies: [...new Set(evidence.flatMap(e => (e.technologies ?? []) as string[]))],
      jobRequirements: op.data.jobRequirements as string[], researchSources: (research?.sources ?? []).map((source, i) => ({
        id: `src-${i}`, url: source.url, title: source.title, supporting_text: source.excerpt,
        accessed_at: source.accessedAt, confidence: source.confidence, classification: "explicit", relevance: 0.5, source_kind: source.type === "public-reference" ? "public-reference" : "job-description",
      })) });
    await store.patch("operation", operationId, { localValidation: result.localValidation });
    const cost = result.usage.estimatedCostCents;
    for (const [kind, count] of [["input_tokens", result.usage.inputTokens], ["output_tokens", result.usage.outputTokens]] as const) {
      await deps.usage.append({ tenantId: run.tenantId, userId: app.ownerUserId, kind,
        units: String(count), costCents: "0", status: "committed", workflowRunId: run.id,
        idempotencyKey: `${key}:${kind}`, metadata: { ...result.usage, policy: "single-request-v1", billable: false } });
    }
    await deps.usage.commitReservedWithCost({ tenantId: run.tenantId, idempotencyKey: key,
      costCents: cost == null ? null : String(cost), userId: app.ownerUserId, workflowRunId: run.id,
      metadata: { billable: cost != null, localValidationMs: result.localValidation.latency_ms } });
    if (!result.localValidation.passed) {
      await deps.applications.update(run.tenantId, app.publicId, { metadata: { ...app.metadata,
        customerError: "The draft needs factual corrections. Your source details and initial response are saved. No further paid generation will run.",
        localValidation: result.localValidation, localCorrectionRequired: true } });
      throw new AppError("LOCAL_CORRECTION_REQUIRED", "Review the saved draft and its evidence before exporting.", 422);
    }
    const output = resumeSchema.parse(result.resume);
    let resume = await deps.resumes.getByApplication(run.tenantId, app.publicId);
    if (!resume) resume = await deps.resumes.createResume({ id: newId("res"), publicId: `res-${operationId}`,
      tenantId: run.tenantId, applicationId: app.id, applicationPublicId: app.publicId,
      title: `${app.role} resume`, templateId: CANDIDARC_CLASSIC_V1_TEMPLATE_ID, length: "auto", currentVersionPublicId: null });
    const version = await deps.resumes.appendVersion({ id: newId("rv"), publicId: `rv-${operationId}`, tenantId: run.tenantId,
      resumeId: resume.id, versionNumber: 0, versionLabel: "Initial resume", score: 0,
      scoreBreakdown: output.scoreBreakdown, notes: "One initial generation; local factual and writing checks. No HR/EM audit or AI final review performed.",
      triggeredBy: "single-request-v1", sections: output.sections, idempotencyKey: `${key}:version`, operationKey: operationId });
    await deps.resumes.setCurrentVersion(run.tenantId, resume.publicId, version.publicId);
    await store.patch("operation", operationId, { versionId: version.publicId });
    await deps.engine.transition(run.id, "V0_READY", { outputVersion: version.publicId });
    await deps.engine.transition(run.id, "FINAL_QA_RUNNING", { message: "Checking document structure locally" });
    return;
  }
  if (run.stage === "V0_READY") {
    await deps.engine.transition(run.id, "FINAL_QA_RUNNING", { message: "Resuming local checks" });
    return;
  }
  if (run.stage === "FINAL_QA_RUNNING") {
    if (!(op.data.localValidation as { passed?: boolean } | undefined)?.passed)
      throw new AppError("LOCAL_VALIDATION_MISSING", "Saved draft has not passed local checks", 422);
    const version = await deps.resumes.getVersion(run.tenantId, String(op.data.versionId));
    if (!version) throw new AppError("RESUME_VERSION_NOT_FOUND", "Saved resume is missing", 409);
    const report = attachQualityProvenance(computeCandidArcQualityScore({ sections: version.sections as Array<Record<string, unknown>>,
      jobRequirements: op.data.jobRequirements as string[], contact: qualityContactFromSnapshot(app) }), { versionPublicId: version.publicId, contact: qualityContactFromSnapshot(app) });
    await deps.applications.update(run.tenantId, app.publicId, { workflowStage: "FINAL_QA_RUNNING", stage: "FINAL_QA_RUNNING",
      metadata: { ...app.metadata, qualityReport: report, currentExportVersionId: version.publicId,
        localValidation: op.data.localValidation, localCapabilities: { generativeModelAvailable: false,
          supportedEdits: ["remove_duplicate_bullets", "normalize_whitespace"], unsupportedRewrites: true },
        finalQa: { passed: true, method: "local", checks: ["structure", "evidence_references", "supported_claim_patterns"], semanticEquivalenceVerified: false } } });
    await deps.queue?.enqueue("pdf-rendering", "customer-resume.render", { tenantId: run.tenantId,
      applicationId: app.publicId, applicationPublicId: app.publicId, versionId: version.publicId, versionPublicId: version.publicId, ownerUserId: app.ownerUserId },
      { idempotencyKey: `single-render:${operationId}:${version.publicId}` });
    await deps.engine.transition(run.id, "FINAL_READY", { status: "completed", message: "Local checks complete; preparing downloads" });
  }
}
