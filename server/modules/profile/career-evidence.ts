import { createHash } from "crypto";
import { newId, type CandidateProfileRecord, type EvidenceRecord, type EvidenceRepository } from "../../database/repositories";
import { adaptResumeExtractionV1ToV2 } from "../resumes/text-extractor";

/** A replacement draft must not change the inputs used for existing reviewed career data. */
export function reviewedCareerProfile(profile: CandidateProfileRecord): CandidateProfileRecord {
  const raw = profile.resumeImportExtraction;
  const baseline = raw?.__confirmedBaseline;
  if (!baseline || typeof baseline !== "object" || profile.resumeImportStatus === "confirmed") return profile;
  const extraction = adaptResumeExtractionV1ToV2(baseline as Record<string, unknown>);
  const contact = extraction?.contact ?? {};
  return { ...profile, ...Object.fromEntries(
    ["fullName", "email", "phone", "location", "linkedIn", "github", "portfolio"].filter((key) => Object.hasOwn(contact, key)).map((key) => [key, contact[key as keyof typeof contact]]),
  ), summary: extraction?.professionalSummary ?? profile.summary,
    sourceResumeFilePublicId: typeof raw?.__confirmedSourceFilePublicId === "string" ? raw.__confirmedSourceFilePublicId : profile.sourceResumeFilePublicId,
    resumeImportExtraction: baseline as Record<string, unknown> };
}

/** Only candidate career fields affect evidence identity; preferences/contact changes do not. */
export function careerFingerprint(profile: CandidateProfileRecord): string | undefined {
  const extraction = adaptResumeExtractionV1ToV2(reviewedCareerProfile(profile).resumeImportExtraction);
  if (!extraction) return undefined;
  return createHash("sha256").update(JSON.stringify({
    employment: extraction.employment, projects: extraction.projects, education: extraction.education,
    skills: extraction.skills, certifications: extraction.certificationEntries, publications: extraction.publications,
  })).digest("hex");
}

/** Old imports stay stored for existing applications, but never supply a new profile revision. */
export function selectCareerEvidence(items: EvidenceRecord[], fingerprint?: string): EvidenceRecord[] {
  if (!fingerprint) return items;
  return items.filter((item) => {
    const source = item.payload?.source;
    if (source === "career-profile") return item.payload?.careerFingerprint === fingerprint;
    if (source === "resume-import") return false;
    if (source === "onboarding" && ["employment", "project", "skills"].includes(String(item.payload?.kind))) return false;
    return true;
  });
}

/** Create immutable evidence for the reviewed profile. Repeated synchronization is idempotent. */
export async function syncCareerEvidenceFromProfile(
  evidence: EvidenceRepository,
  input: { tenantId: string; userId: string; profile: CandidateProfileRecord },
): Promise<number> {
  const extraction = adaptResumeExtractionV1ToV2(reviewedCareerProfile(input.profile).resumeImportExtraction);
  const fingerprint = careerFingerprint(input.profile);
  if (!extraction || !fingerprint) return 0;
  type Entry = { kind: string; title: string; context?: string; organization?: string; text: string[]; technologies?: string[]; details?: unknown };
  const entries: Entry[] = [
    ...extraction.employment.filter((row) => row.title?.trim() || row.company?.trim()).map((row) => ({
      kind: "employment", title: [row.title, row.company].filter(Boolean).join(" at "), organization: row.company,
      context: [row.startDate, row.endDate, row.location].filter(Boolean).join(" · "), text: row.bullets, technologies: row.technologies, details: row,
    })),
    ...extraction.projects.filter((row) => row.name?.trim()).map((row) => ({
      kind: "project", title: row.name!, organization: row.organization,
      context: [row.startDate, row.endDate].filter(Boolean).join(" – "), text: [...(row.description ? [row.description] : []), ...(row.bullets ?? [])], technologies: row.technologies, details: row,
    })),
    ...extraction.education.filter((row) => row.institution?.trim() || row.degree?.trim()).map((row) => ({
      kind: "education", title: [row.degree, row.institution].filter(Boolean).join(" at "), organization: row.institution,
      text: [row.field, row.startDate, row.endDate, row.gpa, row.honors].filter((value): value is string => Boolean(value)), details: row,
    })),
    ...(extraction.certificationEntries ?? []).filter((row) => row.name?.trim()).map((row) => ({
      kind: "certification", title: row.name, organization: row.issuer,
      text: [row.issuer, row.issueDate, row.expirationDate, row.credentialId].filter((value): value is string => Boolean(value)), details: row,
    })),
    ...(extraction.publications ?? []).filter((row) => row.title?.trim()).map((row) => ({
      kind: "publication", title: row.title, organization: row.publisher,
      text: [...(row.authors ?? []), row.publicationDate, row.description].filter((value): value is string => Boolean(value)), details: row,
    })),
    ...(extraction.skills.length ? [{ kind: "skills", title: "Career skills", text: [extraction.skills.join(", ")], technologies: extraction.skills }] : []),
  ];
  let created = 0;
  for (const [index, entry] of entries.entries()) {
    const publicId = `evp_career_${createHash("sha256").update(`${input.userId}:${fingerprint}:${index}`).digest("hex").slice(0, 24)}`;
    if (await evidence.getByPublicId(input.tenantId, publicId)) continue;
    const text = entry.text.filter((line) => line.trim());
    try { await evidence.create({
      id: newId("ev"), publicId, tenantId: input.tenantId, ownerUserId: input.userId,
      candidateProfileId: input.profile.id, title: entry.title, organization: entry.organization ?? "",
      situation: text[0] ?? entry.title, task: [entry.title, entry.context].filter(Boolean).join(" · "), actions: text.slice(1), result: text.at(-1) ?? entry.title,
      technologies: entry.technologies ?? [], confidence: "medium", verificationStatus: "user_attested",
      privacyLevel: "share-safe", excludedFromApplicationIds: [], matchedApplicationIds: [],
      payload: { source: "career-profile", kind: entry.kind, careerFingerprint: fingerprint,
        filePublicId: input.profile.sourceResumeFilePublicId, details: entry.details },
    }); } catch (error) {
      // Another worker may have synchronized this exact immutable revision first.
      if (await evidence.getByPublicId(input.tenantId, publicId)) continue;
      throw error;
    }
    created += 1;
  }
  return created;
}
