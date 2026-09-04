import { getProviderForRole } from "../ai";
import { getPrompt } from "../ai/prompt-registry";
import { jobExtractionSchema, type JobExtractionOutput } from "../ai/schemas";
import type { ApplicationRecord } from "../database/repositories";
import { htmlToPlainText, ssrfFetch } from "../security/ssrf-fetch";

export const PLACEHOLDER_COMPANY = "Target company";
export const PLACEHOLDER_ROLE = "Target role";

export function isPlaceholderIdentity(company: string, role: string): boolean {
  return company.trim() === PLACEHOLDER_COMPANY || role.trim() === PLACEHOLDER_ROLE;
}

export function jobRequirementsFromExtraction(extraction: JobExtractionOutput): string[] {
  return [
    ...extraction.requiredQualifications,
    ...extraction.preferredQualifications,
    ...extraction.responsibilities,
  ].filter(Boolean);
}

export async function fetchJobDescriptionFromUrl(jobUrl: string): Promise<string> {
  const fetched = await ssrfFetch(jobUrl);
  const text = htmlToPlainText(fetched.body.toString("utf8"));
  if (text.length < 20) {
    throw new Error("Job URL did not return enough readable text");
  }
  return text.slice(0, 100_000);
}

export async function extractJobFromText(jobText: string): Promise<JobExtractionOutput> {
  const provider = getProviderForRole("generation");
  const prompt = getPrompt("job-extraction");
  const result = await provider.generateStructured({
    prompt: { id: prompt.id, version: prompt.version, rubricVersion: prompt.rubricVersion },
    system: prompt.system,
    user: JSON.stringify({ jobText: jobText.slice(0, 100_000) }),
    schema: jobExtractionSchema,
  });
  return {
    ...result.data,
    requiredQualifications: result.data.requiredQualifications ?? [],
    preferredQualifications: result.data.preferredQualifications ?? [],
    responsibilities: result.data.responsibilities ?? [],
    targetTechnologies: result.data.targetTechnologies ?? [],
  };
}

export function applyJobExtractionToApplication(
  application: ApplicationRecord,
  extraction: JobExtractionOutput,
): {
  company: string;
  role: string;
  location: string;
  employmentType: string;
  metadata: Record<string, unknown>;
  needsIdentityReview: boolean;
} {
  const currentCompany = application.company.trim();
  const currentRole = application.role.trim();
  const extractedCompany = extraction.company?.trim();
  const extractedRole = extraction.role?.trim();
  const extractedTitle = extraction.title?.trim();

  const company =
    extractedCompany ||
    (isPlaceholderIdentity(currentCompany, currentRole) ? "" : currentCompany) ||
    currentCompany;
  const role =
    extractedRole ||
    extractedTitle ||
    (isPlaceholderIdentity(currentCompany, currentRole) ? "" : currentRole) ||
    currentRole;

  const resolvedCompany = company || PLACEHOLDER_COMPANY;
  const resolvedRole = role || PLACEHOLDER_ROLE;
  const needsIdentityReview =
    !extractedCompany && !extractedRole && !extractedTitle && isPlaceholderIdentity(resolvedCompany, resolvedRole);

  const jobRequirements = jobRequirementsFromExtraction(extraction);
  const metadata = {
    ...application.metadata,
    jobRequirements,
    requiredQualifications: extraction.requiredQualifications,
    preferredQualifications: extraction.preferredQualifications,
    responsibilities: extraction.responsibilities,
    targetTechnologies: extraction.targetTechnologies,
    seniority: extraction.seniority,
    knownTechnologies: extraction.targetTechnologies,
    jobExtractionAppliedAt: new Date().toISOString(),
  };

  return {
    company: needsIdentityReview ? PLACEHOLDER_COMPANY : resolvedCompany,
    role: needsIdentityReview ? PLACEHOLDER_ROLE : resolvedRole,
    location: extraction.location?.trim() || application.location,
    employmentType: extraction.employmentType?.trim() || application.employmentType,
    metadata,
    needsIdentityReview,
  };
}
