import { createHash } from "crypto";
import { newId, type CandidateProfileRecord, type EvidenceRepository } from "../../database/repositories";

type EmploymentLike = {
  title?: string;
  company?: string;
  bullets?: string[];
  startDate?: string;
  endDate?: string;
  technologies?: string[];
};

type ProjectLike = {
  name?: string;
  bullets?: string[];
  technologies?: string[];
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function evidencePublicId(userId: string, kind: string, key: string) {
  const digest = createHash("sha256").update(`${userId}:${kind}:${key}`).digest("hex").slice(0, 16);
  return `evp_career_${kind}_${digest}`;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/** Materialize attested evidence from an onboarding/manual career profile so tailoring can start. */
export async function syncCareerEvidenceFromProfile(
  evidence: EvidenceRepository,
  input: { tenantId: string; userId: string; profile: CandidateProfileRecord },
): Promise<number> {
  const extraction = asRecord(input.profile.resumeImportExtraction) ?? {};
  const employment = Array.isArray(extraction.employment) ? extraction.employment : [];
  const projects = Array.isArray(extraction.projects) ? extraction.projects : [];
  const skills = stringList(extraction.skills);
  let created = 0;

  for (const [index, raw] of employment.entries()) {
    const job = asRecord(raw) as EmploymentLike | null;
    if (!job) continue;
    const title = String(job.title ?? "").trim();
    const company = String(job.company ?? "").trim();
    if (!title && !company) continue;
    const publicId = evidencePublicId(input.userId, "emp", `${index}:${title}:${company}`);
    if (await evidence.getByPublicId(input.tenantId, publicId)) continue;
    const bullets = stringList(job.bullets);
    const heading = [title, company].filter(Boolean).join(" at ") || `Role ${index + 1}`;
    const situation = bullets[0] ?? `Worked as ${heading}`;
    await evidence.create({
      id: newId("ev"),
      publicId,
      tenantId: input.tenantId,
      ownerUserId: input.userId,
      candidateProfileId: input.profile.id,
      title: heading,
      organization: company,
      situation,
      task: `Deliver results as ${title || "individual contributor"}`,
      actions: bullets.slice(1),
      result: bullets.at(-1) ?? situation,
      technologies: stringList(job.technologies),
      confidence: "medium",
      verificationStatus: "user_attested",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: { source: "onboarding", kind: "employment", index },
    });
    created += 1;
  }

  for (const [index, raw] of projects.entries()) {
    const project = asRecord(raw) as ProjectLike | null;
    if (!project) continue;
    const name = String(project.name ?? "").trim();
    if (!name) continue;
    const publicId = evidencePublicId(input.userId, "proj", `${index}:${name}`);
    if (await evidence.getByPublicId(input.tenantId, publicId)) continue;
    const bullets = stringList(project.bullets);
    const situation = bullets[0] ?? `Built ${name}`;
    await evidence.create({
      id: newId("ev"),
      publicId,
      tenantId: input.tenantId,
      ownerUserId: input.userId,
      candidateProfileId: input.profile.id,
      title: name,
      organization: "",
      situation,
      task: `Ship ${name}`,
      actions: bullets.slice(1),
      result: bullets.at(-1) ?? situation,
      technologies: stringList(project.technologies),
      confidence: "medium",
      verificationStatus: "user_attested",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: { source: "onboarding", kind: "project", index },
    });
    created += 1;
  }

  if (!created && skills.length) {
    const publicId = evidencePublicId(input.userId, "skills", skills.join("|"));
    if (!(await evidence.getByPublicId(input.tenantId, publicId))) {
      await evidence.create({
        id: newId("ev"),
        publicId,
        tenantId: input.tenantId,
        ownerUserId: input.userId,
        candidateProfileId: input.profile.id,
        title: "Career skills",
        organization: "",
        situation: `Attested skills: ${skills.slice(0, 12).join(", ")}`,
        task: "Use attested skills in tailored resumes",
        actions: [],
        result: skills.slice(0, 12).join(", "),
        technologies: skills.slice(0, 12),
        confidence: "medium",
        verificationStatus: "user_attested",
        privacyLevel: "share-safe",
        excludedFromApplicationIds: [],
        matchedApplicationIds: [],
        payload: { source: "onboarding", kind: "skills" },
      });
      created += 1;
    }
  }

  return created;
}
