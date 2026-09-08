import type { AuthContext } from "../../auth/guards";
import { requireTenantMembership, requireTenantRole, requireUser } from "../../auth/guards";
import type { CandidateProfileRecord, EvidenceRepository, Repositories } from "../../database/repositories";
import { newId } from "../../database/repositories";
import { AppError } from "../../domain/types";
import {
  assertCanComplete,
  assertStepPayload,
  hasCareerProfileReady,
  mergeExtraction,
  normalizeTitleList,
  type OnboardingStepData,
} from "./onboarding";

const CAREER_NOTES_TITLE = "Career notes";

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function emptyProfileDefaults(
  tenantId: string,
  userId: string,
  name: string,
  email: string,
): Omit<CandidateProfileRecord, "createdAt" | "updatedAt" | "deletedAt" | "version"> {
  return {
    id: newId("cp"),
    publicId: newId("cpp"),
    tenantId,
    userId,
    fullName: name || "Candidate",
    preferredName: null,
    email,
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
    avatarInitials: initialsFromName(name || "Candidate"),
    remoteOk: true,
    preferredLocations: [],
    workAuthorization: null,
    requiresSponsorship: null,
    targetCompanies: [],
    targetIndustries: [],
    jobTypes: [],
    workplaceModes: [],
    willingToRelocate: null,
    salaryPreference: null,
    seniority: null,
    onboardingStep: 0,
    onboardingCompletedAt: null,
    modelImprovementOptIn: false,
    sourceResumeFilePublicId: null,
    resumeImportStatus: null,
    resumeImportExtraction: null,
  };
}

export class ProfileService {
  constructor(
    private readonly profiles: Repositories["candidateProfiles"],
    private readonly evidence: EvidenceRepository,
  ) {}

  static fromRepos(repos: Repositories) {
    return new ProfileService(repos.candidateProfiles, repos.evidence);
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
    return this.profiles.upsert(emptyProfileDefaults(tenantId, user.id, user.name, user.email));
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
        | "targetCompanies"
        | "targetIndustries"
        | "jobTypes"
        | "workplaceModes"
        | "willingToRelocate"
        | "salaryPreference"
        | "seniority"
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

  private async upsertCareerNotesEvidence(
    tenantId: string,
    userId: string,
    candidateProfileId: string,
    notes: string,
  ) {
    const owned = await this.evidence.list(tenantId, { ownerUserId: userId });
    const existing = owned.find((item) => item.title === CAREER_NOTES_TITLE);
    if (existing) {
      return this.evidence.update(tenantId, existing.publicId, {
        situation: notes,
        result: notes,
        verificationStatus: "user_attested",
      });
    }
    return this.evidence.create({
      id: newId("ev"),
      publicId: newId("evp-career-notes"),
      tenantId,
      ownerUserId: userId,
      candidateProfileId,
      title: CAREER_NOTES_TITLE,
      organization: "",
      situation: notes,
      task: "Capture career context for resume generation",
      actions: [],
      result: notes,
      technologies: [],
      confidence: "medium",
      verificationStatus: "user_attested",
      privacyLevel: "share-safe",
      excludedFromApplicationIds: [],
      matchedApplicationIds: [],
      payload: { source: "onboarding", kind: "career-notes" },
    });
  }

  private applyStepData(
    data: OnboardingStepData,
    current: CandidateProfileRecord,
  ): Partial<CandidateProfileRecord> {
    const patch: Partial<CandidateProfileRecord> = {};

    if (data.targetRoles) {
      patch.targetRoleFamilies = normalizeTitleList(data.targetRoles);
      if (!data.careerGoal && patch.targetRoleFamilies.length) {
        patch.careerGoal = `Targeting: ${patch.targetRoleFamilies.join(", ")}`;
      }
    }
    if (data.seniority !== undefined) patch.seniority = data.seniority;
    if (data.targetCompanies) patch.targetCompanies = normalizeTitleList(data.targetCompanies, 30);
    if (data.targetIndustries) patch.targetIndustries = normalizeTitleList(data.targetIndustries, 30);
    if (data.jobTypes) patch.jobTypes = [...data.jobTypes];
    if (data.workplaceModes) {
      patch.workplaceModes = [...data.workplaceModes];
      patch.remoteOk = data.workplaceModes.includes("remote") || data.workplaceModes.includes("hybrid");
    }
    if (data.preferredLocations) {
      patch.preferredLocations = normalizeTitleList(data.preferredLocations);
      if (patch.preferredLocations[0] && data.location === undefined) {
        patch.location = patch.preferredLocations[0]!;
      }
    }
    if (data.willingToRelocate !== undefined) patch.willingToRelocate = data.willingToRelocate;
    if (data.workAuthorization !== undefined) patch.workAuthorization = data.workAuthorization;
    if (data.requiresSponsorship !== undefined) patch.requiresSponsorship = data.requiresSponsorship;
    if (data.salaryPreference !== undefined) patch.salaryPreference = data.salaryPreference;

    if (typeof data.fullName === "string") {
      patch.fullName = data.fullName;
      patch.avatarInitials = initialsFromName(data.fullName);
    }
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.location !== undefined) {
      patch.location = data.location;
      if (data.location && !data.preferredLocations) {
        patch.preferredLocations = [data.location];
      }
    }
    if (data.linkedIn !== undefined) patch.linkedIn = data.linkedIn;
    if (data.github !== undefined) patch.github = data.github;
    if (data.portfolio !== undefined) patch.portfolio = data.portfolio;
    if (data.headline !== undefined) patch.headline = data.headline;
    if (data.summary !== undefined) patch.summary = data.summary;
    if (typeof data.careerGoal === "string") patch.careerGoal = data.careerGoal;
    if (typeof data.experienceLevel === "string") patch.experienceLevel = data.experienceLevel;
    if (typeof data.resumeLength === "string") patch.preferredResumeLength = data.resumeLength;
    if (typeof data.modelImprovement === "boolean") patch.modelImprovementOptIn = data.modelImprovement;
    if (typeof data.remoteOk === "boolean") patch.remoteOk = data.remoteOk;
    if (typeof data.yearsExperience === "number") patch.yearsExperience = data.yearsExperience;

    const touchesCareerDraft =
      data.skills !== undefined ||
      data.employment !== undefined ||
      data.education !== undefined ||
      data.certifications !== undefined ||
      data.careerProfileMode !== undefined ||
      data.fullName !== undefined ||
      data.email !== undefined;

    if (touchesCareerDraft) {
      patch.resumeImportExtraction = mergeExtraction(current.resumeImportExtraction, data);
      if (data.careerProfileMode === "manual" && current.resumeImportStatus !== "confirmed") {
        const merged = { ...current, ...patch } as CandidateProfileRecord;
        const extraction = patch.resumeImportExtraction ?? current.resumeImportExtraction;
        const probe: CandidateProfileRecord = {
          ...merged,
          resumeImportExtraction: extraction ?? null,
          resumeImportStatus: "ready_for_review",
        };
        // Keep status as draft-like until completion confirms readiness; still allow review.
        if (probe.resumeImportStatus !== "confirmed") {
          patch.resumeImportStatus = current.resumeImportStatus === "confirmed" ? "confirmed" : "ready_for_review";
        }
      }
    }

    return patch;
  }

  async updateOnboarding(
    ctx: AuthContext,
    patch: {
      step?: number;
      completed?: boolean;
      expectedVersion: number;
      data?: OnboardingStepData;
    },
  ) {
    const user = requireUser(ctx);
    const tenantId = this.tenantId(ctx);
    requireTenantRole(ctx, tenantId, ["owner", "admin", "member"]);

    if (typeof patch.expectedVersion !== "number" || !Number.isInteger(patch.expectedVersion) || patch.expectedVersion < 1) {
      throw new AppError("ONBOARDING_VALIDATION", "expectedVersion is required", 400);
    }

    const current = await this.getOrCreate(ctx);

    // Idempotent completion against the already-completed current version.
    if (patch.completed && current.onboardingCompletedAt) {
      if (patch.expectedVersion !== current.version) {
        throw new AppError(
          "ONBOARDING_STALE",
          "Onboarding data changed elsewhere. Reload and try again.",
          409,
          { expectedVersion: patch.expectedVersion, currentVersion: current.version },
        );
      }
      return current;
    }

    // Validate required fields only when advancing past a step (not on autosave).
    if (typeof patch.step === "number" && patch.step > current.onboardingStep) {
      const leaving = current.onboardingStep;
      if (leaving <= 1) {
        assertStepPayload(leaving, patch.data);
      }
      if (leaving === 2) {
        const probe = patch.data
          ? ({ ...current, ...this.applyStepData(patch.data, current) } as CandidateProfileRecord)
          : current;
        if (!hasCareerProfileReady(probe) && !hasManualCareerReady(probe)) {
          throw new AppError(
            "ONBOARDING_VALIDATION",
            "Confirm a resume import or enter career experience before continuing",
            400,
          );
        }
      }
    }

    const onboardingPatch: Partial<CandidateProfileRecord> = {};
    if (typeof patch.step === "number") onboardingPatch.onboardingStep = patch.step;
    if (patch.data) Object.assign(onboardingPatch, this.applyStepData(patch.data, current));

    const prospective: CandidateProfileRecord = {
      ...current,
      ...onboardingPatch,
    };

    if (patch.completed) {
      assertCanComplete(prospective);
      onboardingPatch.onboardingCompletedAt = new Date().toISOString();
      onboardingPatch.onboardingStep = 3;
      if (prospective.resumeImportStatus !== "confirmed" && hasManualCareerReady(prospective)) {
        onboardingPatch.resumeImportStatus = "confirmed";
      }
    }

    if (Object.keys(onboardingPatch).length === 0) {
      // No-op write still requires matching version so concurrent writers cannot slip through.
      if (patch.expectedVersion !== current.version) {
        throw new AppError(
          "ONBOARDING_STALE",
          "Onboarding data changed elsewhere. Reload and try again.",
          409,
          { expectedVersion: patch.expectedVersion, currentVersion: current.version },
        );
      }
      return current;
    }

    const updated = await this.profiles.updateOnboarding(
      tenantId,
      user.id,
      patch.expectedVersion,
      onboardingPatch,
    );

    if (typeof patch.data?.evidenceNotes === "string" && patch.data.evidenceNotes.trim()) {
      await this.upsertCareerNotesEvidence(tenantId, user.id, updated.id, patch.data.evidenceNotes.trim());
    }

    return updated;
  }
}

function hasManualCareerReady(profile: CandidateProfileRecord): boolean {
  const extraction = profile.resumeImportExtraction ?? {};
  const employment = Array.isArray(extraction.employment) ? extraction.employment : [];
  const skills = Array.isArray(extraction.skills) ? extraction.skills : [];
  const hasEmployment = employment.some((row) => {
    if (!row || typeof row !== "object") return false;
    const item = row as Record<string, unknown>;
    return Boolean(String(item.title ?? "").trim() || String(item.company ?? "").trim());
  });
  const hasSkills = skills.some((s) => typeof s === "string" && s.trim());
  return Boolean(profile.fullName?.trim() && (hasEmployment || hasSkills));
}
