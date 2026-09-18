import { getRuntime, mapProfileToUi } from "@server/bootstrap";
import { buildAuthContext } from "@server/http/context";
import { jsonOk, jsonError } from "@server/http/response";
import { requireUser } from "@server/auth/guards";
import type { ResumeExtractionSection } from "@server/modules/resumes/text-extractor";
import { onboardingStepDataSchema } from "@server/modules/profile/onboarding";
import { z } from "zod";
import { assertCsrf } from "@server/http/csrf";

export async function GET(request: Request) {
  let requestId = "";
  try {
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const runtime = await getRuntime();
    const status = await runtime.services.resumeImport.getImportStatus(ctx);
    return jsonOk({ ...status, profile: mapProfileToUi(status.profile) });
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}

export async function PATCH(request: Request) {
  let requestId = "";
  try {
    assertCsrf(request);
    const ctx = await buildAuthContext(request);
    requestId = ctx.requestId;
    requireUser(ctx);
    const fields = onboardingStepDataSchema.shape;
    const reviewedSchema = z.object({
      contact: z.object({ fullName: z.string().max(160).optional(), email: fields.email,
        phone: fields.phone, location: fields.location, linkedIn: fields.linkedIn,
        github: fields.github, portfolio: fields.portfolio, headline: fields.headline }).passthrough().optional(),
      employment: fields.employment, projects: fields.projects, skills: fields.skills,
      education: z.array(fields.education.unwrap().element.omit({ school: true }).extend({ institution: z.string().max(200).optional() })).max(20).optional(),
      certificationEntries: z.array(fields.certifications.unwrap().element.omit({ date: true }).extend({ issueDate: z.string().max(40).optional() })).max(20).optional(),
      certifications: z.array(z.string().max(200)).max(20).optional(),
      publications: fields.publications, professionalSummary: fields.summary,
    }).passthrough();
    const body = z.object({ expectedVersion: z.number().int().positive(), extraction: reviewedSchema }).parse(await request.json());
    const runtime = await getRuntime();
    const result = await runtime.services.resumeImport.updateExtraction(ctx, body.extraction as ResumeExtractionSection, body.expectedVersion);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err, requestId || undefined);
  }
}
