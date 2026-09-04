import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { CandidateProfileRecord, CandidateProfileRepository, Repositories } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export class ProfileService {
  constructor(private readonly profiles: CandidateProfileRepository) {}

  static fromRepos(repos: Repositories) {
    return new ProfileService(repos.candidateProfiles);
  }

  private tenantId(ctx: AuthContext) {
    requireUser(ctx);
    if (!ctx.activeTenantId) throw new AppError("TENANT_REQUIRED", "Active tenant required", 400);
    requireTenantMembership(ctx, ctx.activeTenantId);
    return ctx.activeTenantId;
  }

  async getOrCreate(ctx: AuthContext): Promise<CandidateProfileRecord> {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    const existing = await this.profiles.getByUser(tenantId, user.id);
    if (existing) return existing;

    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    return this.profiles.upsert({
      id: newId("cp"),
      publicId: newId("cpp"),
      tenantId,
      userId: user.id,
      fullName: user.name || "Candidate",
      preferredName: null,
      email: user.email,
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
      careerGoal: null,
      avatarInitials: initialsFromName(user.name || "Candidate"),
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
  }

  async get(ctx: AuthContext) {
    return this.getOrCreate(ctx);
  }

  async update(
    ctx: AuthContext,
    patch: Partial<
      Pick<
        CandidateProfileRecord,
        | "fullName"
        | "preferredName"
        | "email"
        | "phone"
        | "location"
        | "linkedIn"
        | "github"
        | "portfolio"
        | "headline"
        | "summary"
        | "experienceLevel"
        | "yearsExperience"
        | "targetRoleFamilies"
        | "preferredResumeLength"
        | "careerGoal"
        | "remoteOk"
        | "preferredLocations"
        | "workAuthorization"
        | "requiresSponsorship"
        | "modelImprovementOptIn"
      >
    >,
  ) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    await this.getOrCreate(ctx);
    const next: Partial<CandidateProfileRecord> = { ...patch };
    if (patch.fullName) {
      next.avatarInitials = initialsFromName(patch.fullName);
    }
    return this.profiles.update(tenantId, user.id, next);
  }

  async updateOnboarding(
    ctx: AuthContext,
    patch: {
      step?: number;
      completed?: boolean;
      data?: Record<string, unknown>;
    },
  ) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);
    await this.getOrCreate(ctx);

    const onboardingPatch: Partial<CandidateProfileRecord> = {};
    if (typeof patch.step === "number") onboardingPatch.onboardingStep = patch.step;
    if (patch.completed) onboardingPatch.onboardingCompletedAt = new Date().toISOString();

    const data = patch.data ?? {};
    if (typeof data.careerGoal === "string") onboardingPatch.careerGoal = data.careerGoal;
    if (typeof data.fullName === "string") {
      onboardingPatch.fullName = data.fullName;
      onboardingPatch.avatarInitials = initialsFromName(data.fullName);
    }
    if (typeof data.email === "string") onboardingPatch.email = data.email;
    if (typeof data.phone === "string") onboardingPatch.phone = data.phone;
    if (typeof data.location === "string") {
      onboardingPatch.location = data.location;
      onboardingPatch.preferredLocations = [data.location];
    }
    if (typeof data.github === "string") onboardingPatch.github = data.github;
    if (typeof data.portfolio === "string") onboardingPatch.portfolio = data.portfolio;
    if (typeof data.experienceLevel === "string") onboardingPatch.experienceLevel = data.experienceLevel;
    if (typeof data.resumeLength === "string") onboardingPatch.preferredResumeLength = data.resumeLength;
    if (Array.isArray(data.targetRoles)) {
      onboardingPatch.targetRoleFamilies = data.targetRoles.filter((r): r is string => typeof r === "string");
    }
    if (typeof data.modelImprovement === "boolean") onboardingPatch.modelImprovementOptIn = data.modelImprovement;
    if (typeof data.remoteOk === "boolean") onboardingPatch.remoteOk = data.remoteOk;
    if (typeof data.workAuthorization === "string") onboardingPatch.workAuthorization = data.workAuthorization;
    if (typeof data.requiresSponsorship === "boolean") onboardingPatch.requiresSponsorship = data.requiresSponsorship;
    if (typeof data.yearsExperience === "number") onboardingPatch.yearsExperience = data.yearsExperience;

    return this.profiles.updateOnboarding(tenantId, user.id, onboardingPatch);
  }
}
