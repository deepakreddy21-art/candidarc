import { describe, expect, it } from "vitest";
import { ensureDemoUser } from "@server/auth/demo-auth";
import type { AuthContext } from "@server/auth/guards";
import { createEmptyMemoryStore, newId } from "@server/database/repositories";
import { ProfileService } from "@server/modules/profile/service";
import { careerFingerprint, reviewedCareerProfile, selectCareerEvidence, syncCareerEvidenceFromProfile } from "@server/modules/profile/career-evidence";
import { loadCandidateProfileForMatch, parseSalaryMin } from "@server/radar/profile";
import { mapResumeProgress, defaultCandidateStatus } from "@/lib/application-presentation";
import { looksProprietary } from "@/lib/resume-evidence-policy";

async function setup() {
  const { repos, userId, tenantId } = await ensureDemoUser(createEmptyMemoryStore());
  const ctx: AuthContext = { requestId: "test", activeTenantId: tenantId,
    user: { id: userId, publicId: "candidate", email: "candidate@example.com", name: "Candidate" },
    memberships: [{ tenantId, tenantPublicId: "tenant", role: "owner" }],
    repos: { applications: repos.applications, evidence: repos.evidence } };
  return { repos, userId, tenantId, ctx };
}

describe("candidate truth boundaries", () => {
  it("isolates evidence from another owner in the SAME tenant", async () => {
    const { repos, userId, tenantId, ctx } = await setup();
    await repos.evidence.create({ id: newId("ev"), publicId: newId("evp"), tenantId, ownerUserId: "other-member",
      candidateProfileId: null, title: "Other member", organization: "Employer", situation: "Other work", task: "Other task", actions: [], result: "Other result",
      technologies: ["SecretOtherMemberTechnology"], confidence: "high", verificationStatus: "user_attested", privacyLevel: "share-safe", excludedFromApplicationIds: [], matchedApplicationIds: [], payload: {} });
    const loaded = await loadCandidateProfileForMatch(ctx, repos);
    expect(loaded.skills).not.toContain("SecretOtherMemberTechnology");
    expect(userId).not.toBe("other-member");
  });

  it("keeps evidence immutable for an old application while new tailoring uses corrected facts", async () => {
    const { repos, userId, tenantId } = await setup();
    const first = await repos.candidateProfiles.update(tenantId, userId, { resumeImportExtraction: {
      employment: [{ title: "Engineer", company: "Old company", bullets: ["Old responsibility"] }], skills: ["OldTool"], education: [], projects: [], certifications: [],
    } });
    await Promise.all([1, 2].map(() => syncCareerEvidenceFromProfile(repos.evidence, { tenantId, userId, profile: first })));
    const initialEvidence = selectCareerEvidence(await repos.evidence.list(tenantId, { ownerUserId: userId }), careerFingerprint(first));
    expect(initialEvidence).toHaveLength(2);
    const oldFingerprint = careerFingerprint(first);
    const second = await repos.candidateProfiles.update(tenantId, userId, { resumeImportExtraction: {
      employment: [{ title: "Engineer", company: "Correct company", bullets: ["Correct responsibility"] }], skills: [], education: [], projects: [], certifications: [],
    } });
    await syncCareerEvidenceFromProfile(repos.evidence, { tenantId, userId, profile: second });
    expect(await syncCareerEvidenceFromProfile(repos.evidence, { tenantId, userId, profile: second })).toBe(0);
    const all = await repos.evidence.list(tenantId, { ownerUserId: userId });
    const current = selectCareerEvidence(all, careerFingerprint(second));
    expect(current.some((row) => row.organization === "Old company" || row.technologies.includes("OldTool"))).toBe(false);
    expect(current.some((row) => row.organization === "Correct company")).toBe(true);
    expect(selectCareerEvidence(all, oldFingerprint).some((row) => row.organization === "Old company")).toBe(true);
  });

  it("uses the confirmed career baseline until a replacement is accepted", async () => {
    const { repos, tenantId, userId } = await setup();
    const baseline = { contact: { fullName: "Reviewed Name" }, employment: [], education: [], projects: [], skills: ["ReviewedSkill"], certifications: [] };
    const replacement = await repos.candidateProfiles.update(tenantId, userId, {
      resumeImportStatus: "ready_for_review", fullName: "Unconfirmed Name",
      resumeImportExtraction: { ...baseline, contact: { fullName: "Unconfirmed Name" }, skills: ["UnconfirmedSkill"], __confirmedBaseline: baseline },
    });
    const reviewed = reviewedCareerProfile(replacement);
    expect(reviewed.fullName).toBe("Reviewed Name");
    expect(reviewed.resumeImportExtraction?.skills).toEqual(["ReviewedSkill"]);
  });

  it("rejects a stale writer instead of protecting imports by ignoring the candidate's edits", async () => {
    const { repos, userId, tenantId, ctx } = await setup();
    const service = ProfileService.fromRepos(repos);
    const initial = await repos.candidateProfiles.getByUser(tenantId, userId);
    const saved = await service.updateOnboarding(ctx, { expectedVersion: initial!.version, data: { fullName: "Correct Name", portfolio: "", education: [{ school: "Correct University", field: "Physics" }] } });
    await expect(service.updateOnboarding(ctx, { expectedVersion: initial!.version, data: { fullName: "Stale Name", education: [] } })).rejects.toMatchObject({ code: "ONBOARDING_STALE" });
    const loaded = await service.get(ctx);
    expect(loaded.fullName).toBe("Correct Name");
    expect(loaded.resumeImportExtraction?.education).toEqual([{ institution: "Correct University", field: "Physics" }]);
    expect(loaded.version).toBe(saved.version);
  });

  it("does not mark a high-scoring resume ready before final QA", () => {
    expect(mapResumeProgress({ status: "final-qa", stage: "final-qa", resumeScore: 91 })).toBe("Preparing");
    expect(defaultCandidateStatus({ status: "final-qa", resumeScore: 91, archived: false, interviewStatus: "not-started" })).toBe("Saved");
  });

  it.each(["TypeScript", "PostgreSQL", "OpenTelemetry", "PyTorch", "FastAPI"])("does not classify %s as proprietary from capitalization", (technology) => {
    expect(looksProprietary(technology)).toBe(false);
  });

  it("parses the lower end of annual ranges without concatenating digits or converting hourly pay", () => {
    expect(parseSalaryMin("USD 120,000–150,000 / year")).toBe(120000);
    expect(parseSalaryMin("120k - 150k")).toBe(120000);
    expect(parseSalaryMin("$60/hour")).toBeUndefined();
    expect(parseSalaryMin("negotiable")).toBeUndefined();
  });
});
