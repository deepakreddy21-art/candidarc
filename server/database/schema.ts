import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** UTC timestamps — all timestamptz columns are stored and compared in UTC. */
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const deletedAt = () => ts("deleted_at");
const publicId = () => text("public_id").notNull();
const version = () => integer("version").notNull().default(1);

export const tenantRoleEnum = pgEnum("tenant_role", [
  "owner",
  "admin",
  "member",
  "viewer",
  "support",
]);

export const tenantPlanEnum = pgEnum("tenant_plan", ["free", "pro", "team", "enterprise"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "draft",
  "researching",
  "evidence",
  "resume",
  "auditing",
  "final-qa",
  "ready",
  "interviewing",
  "archived",
]);

export const workflowStageEnum = pgEnum("workflow_stage", [
  "APPLICATION_CREATED",
  "RESEARCH_QUEUED",
  "RESEARCH_RUNNING",
  "RESEARCH_REVIEW_REQUIRED",
  "RESEARCH_COMPLETED",
  "EVIDENCE_MATCHING_RUNNING",
  "EVIDENCE_MATCHING_COMPLETED",
  "V0_GENERATING",
  "V0_READY",
  "HR_AUDIT_1_RUNNING",
  "HR_AUDIT_1_REVIEW",
  "V1_GENERATING",
  "V1_READY",
  "EM_AUDIT_1_RUNNING",
  "EM_AUDIT_1_REVIEW",
  "V2_GENERATING",
  "V2_READY",
  "HR_AUDIT_2_RUNNING",
  "HR_AUDIT_2_REVIEW",
  "V3_GENERATING",
  "V3_READY",
  "EM_AUDIT_2_RUNNING",
  "EM_AUDIT_2_REVIEW",
  "V4_GENERATING",
  "V4_READY",
  "FINAL_QA_RUNNING",
  "FINAL_QA_FAILED",
  "FINAL_READY",
  "CANCELLED",
  "FAILED",
]);

export const workflowRunStatusEnum = pgEnum("workflow_run_status", [
  "queued",
  "running",
  "waiting_review",
  "completed",
  "failed",
  "cancelled",
  "retrying",
]);

export const interviewStatusEnum = pgEnum("interview_status", [
  "not-started",
  "preparing",
  "ready",
  "completed",
]);

export const confidenceEnum = pgEnum("confidence", ["high", "medium", "low"]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "inferred",
  "unverified",
  "disputed",
  "user_attested",
]);

export const privacyLevelEnum = pgEnum("privacy_level", [
  "public",
  "share-safe",
  "private",
  "do-not-use",
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "critical",
  "major",
  "minor",
  "suggestion",
]);

export const findingStatusEnum = pgEnum("finding_status", [
  "open",
  "accepted",
  "edited",
  "rejected",
  "deferred",
]);

export const auditLensEnum = pgEnum("audit_lens", ["hr-1", "em-1", "hr-2", "em-2", "final-qa"]);

export const usageKindEnum = pgEnum("usage_kind", [
  "research",
  "resume_generation",
  "audit",
  "embedding",
  "interview_minutes",
  "transcription_minutes",
  "storage",
  "export",
  "input_tokens",
  "output_tokens",
  "provider_cost",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "processing",
  "published",
  "failed",
]);

/* -------------------------------------------------------------------------- */
/* Identity & tenancy                                                         */
/* -------------------------------------------------------------------------- */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    passwordHash: text("password_hash"),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("users_public_id_uidx").on(t.publicId),
    uniqueIndex("users_email_uidx").on(t.email),
  ],
);

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    name: text("name").notNull(),
    plan: tenantPlanEnum("plan").notNull().default("free"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("tenants_public_id_uidx").on(t.publicId)],
);

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: tenantRoleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tenant_memberships_tenant_user_uidx").on(t.tenantId, t.userId),
    index("tenant_memberships_user_idx").on(t.userId),
    index("tenant_memberships_tenant_idx").on(t.tenantId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_uidx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Candidate & applications                                                   */
/* -------------------------------------------------------------------------- */

export const candidateProfiles = pgTable(
  "candidate_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    fullName: text("full_name").notNull(),
    preferredName: text("preferred_name"),
    email: text("email"),
    phone: text("phone"),
    location: text("location"),
    linkedIn: text("linkedin"),
    github: text("github"),
    portfolio: text("portfolio"),
    headline: text("headline"),
    summary: text("summary"),
    experienceLevel: text("experience_level"),
    yearsExperience: integer("years_experience"),
    targetRoleFamilies: jsonb("target_role_families").$type<string[]>().default([]),
    preferredResumeLength: text("preferred_resume_length"),
    careerGoal: text("career_goal"),
    avatarInitials: text("avatar_initials"),
    remoteOk: boolean("remote_ok").notNull().default(true),
    preferredLocations: jsonb("preferred_locations").$type<string[]>().default([]),
    workAuthorization: text("work_authorization"),
    requiresSponsorship: boolean("requires_sponsorship"),
    onboardingStep: integer("onboarding_step").notNull().default(0),
    onboardingCompletedAt: ts("onboarding_completed_at"),
    modelImprovementOptIn: boolean("model_improvement_opt_in").notNull().default(false),
    sourceResumeFilePublicId: text("source_resume_file_public_id"),
    resumeImportStatus: text("resume_import_status"),
    resumeImportExtraction: jsonb("resume_import_extraction").$type<Record<string, unknown>>(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("candidate_profiles_public_id_uidx").on(t.publicId),
    index("candidate_profiles_tenant_idx").on(t.tenantId),
    index("candidate_profiles_user_tenant_idx").on(t.tenantId, t.userId),
  ],
);

export const jobDescriptions = pgTable(
  "job_descriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    company: text("company").notNull(),
    location: text("location"),
    employmentType: text("employment_type"),
    source: text("source"),
    url: text("url"),
    postedAt: ts("posted_at"),
    deadline: text("deadline"),
    rawText: text("raw_text").notNull().default(""),
    requirements: jsonb("requirements").$type<string[]>().default([]),
    preferred: jsonb("preferred").$type<string[]>().default([]),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("job_descriptions_public_id_uidx").on(t.publicId),
    index("job_descriptions_tenant_idx").on(t.tenantId),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    companyMark: text("company_mark"),
    role: text("role").notNull(),
    location: text("location"),
    employmentType: text("employment_type"),
    status: applicationStatusEnum("status").notNull().default("draft"),
    stage: workflowStageEnum("stage").notNull().default("APPLICATION_CREATED"),
    workflowStage: workflowStageEnum("workflow_stage").notNull().default("APPLICATION_CREATED"),
    resumeScore: integer("resume_score").notNull().default(0),
    evidenceCoverage: integer("evidence_coverage").notNull().default(0),
    atsAlignment: integer("ats_alignment").notNull().default(0),
    interviewStatus: interviewStatusEnum("interview_status").notNull().default("not-started"),
    researchConfidence: integer("research_confidence").notNull().default(0),
    deadline: text("deadline"),
    archived: boolean("archived").notNull().default(false),
    roleFamily: text("role_family"),
    nextAction: text("next_action"),
    jobDescriptionId: uuid("job_description_id").references(() => jobDescriptions.id, {
      onDelete: "set null",
    }),
    resumeId: uuid("resume_id"),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    candidateProfileId: uuid("candidate_profile_id").references(() => candidateProfiles.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("applications_public_id_uidx").on(t.publicId),
    index("applications_tenant_idx").on(t.tenantId),
    index("applications_tenant_status_idx").on(t.tenantId, t.status),
    index("applications_owner_idx").on(t.ownerUserId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Research                                                                   */
/* -------------------------------------------------------------------------- */

export const researchRuns = pgTable(
  "research_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("queued"),
    depth: text("depth").notNull().default("standard"),
    confidence: integer("confidence").default(0),
    workflowRunId: uuid("workflow_run_id"),
    promptVersion: text("prompt_version"),
    errorMessage: text("error_message"),
    version: version(),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("research_runs_public_id_uidx").on(t.publicId),
    index("research_runs_tenant_idx").on(t.tenantId),
    index("research_runs_application_idx").on(t.applicationId),
  ],
);

export const researchSources = pgTable(
  "research_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    researchRunId: uuid("research_run_id").references(() => researchRuns.id, {
      onDelete: "cascade",
    }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    url: text("url"),
    accessedAt: ts("accessed_at"),
    type: text("type").notNull().default("job-posting"),
    rawSnippet: text("raw_snippet"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("research_sources_public_id_uidx").on(t.publicId),
    index("research_sources_tenant_idx").on(t.tenantId),
    index("research_sources_run_idx").on(t.researchRunId),
  ],
);

export const researchFindings = pgTable(
  "research_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    researchRunId: uuid("research_run_id").references(() => researchRuns.id, {
      onDelete: "cascade",
    }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    confidence: confidenceEnum("confidence").notNull().default("medium"),
    status: verificationStatusEnum("status").notNull().default("inferred"),
    sourceIds: jsonb("source_ids").$type<string[]>().default([]),
    useInResumeStrategy: boolean("use_in_resume_strategy").notNull().default(true),
    dateAccessed: ts("date_accessed"),
    uncertaintyNote: text("uncertainty_note"),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("research_findings_public_id_uidx").on(t.publicId),
    index("research_findings_tenant_idx").on(t.tenantId),
    index("research_findings_application_idx").on(t.applicationId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Evidence                                                                   */
/* -------------------------------------------------------------------------- */

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    candidateProfileId: uuid("candidate_profile_id").references(() => candidateProfiles.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    organization: text("organization"),
    situation: text("situation"),
    task: text("task"),
    actions: jsonb("actions").$type<string[]>().default([]),
    result: text("result"),
    technologies: jsonb("technologies").$type<string[]>().default([]),
    roleRelevance: jsonb("role_relevance").$type<string[]>().default([]),
    confidence: confidenceEnum("confidence").notNull().default("medium"),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    supportingSource: text("supporting_source"),
    privacyLevel: privacyLevelEnum("privacy_level").notNull().default("share-safe"),
    resumeUsageHistory: jsonb("resume_usage_history").$type<string[]>().default([]),
    interviewStoryReady: boolean("interview_story_ready").notNull().default(false),
    tags: jsonb("tags").$type<string[]>().default([]),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("evidence_items_public_id_uidx").on(t.publicId),
    index("evidence_items_tenant_idx").on(t.tenantId),
    index("evidence_items_tenant_owner_idx").on(t.tenantId, t.ownerUserId),
  ],
);

export const evidenceMetrics = pgTable(
  "evidence_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    evidenceItemId: uuid("evidence_item_id")
      .notNull()
      .references(() => evidenceItems.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    unit: text("unit"),
    baseline: text("baseline"),
    verified: boolean("verified").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("evidence_metrics_public_id_uidx").on(t.publicId),
    index("evidence_metrics_tenant_idx").on(t.tenantId),
    index("evidence_metrics_item_idx").on(t.evidenceItemId),
  ],
);

export const evidenceAttachments = pgTable(
  "evidence_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    evidenceItemId: uuid("evidence_item_id")
      .notNull()
      .references(() => evidenceItems.id, { onDelete: "cascade" }),
    storedFileId: uuid("stored_file_id"),
    label: text("label"),
    mimeType: text("mime_type"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("evidence_attachments_public_id_uidx").on(t.publicId),
    index("evidence_attachments_tenant_idx").on(t.tenantId),
    index("evidence_attachments_item_idx").on(t.evidenceItemId),
  ],
);

export const evidenceApplicationMatches = pgTable(
  "evidence_application_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    evidenceItemId: uuid("evidence_item_id")
      .notNull()
      .references(() => evidenceItems.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    requirement: text("requirement"),
    importance: text("importance").default("required"),
    evidenceStrength: confidenceEnum("evidence_strength").default("medium"),
    resumeUsage: text("resume_usage").default("unused"),
    coverageGap: text("coverage_gap"),
    excluded: boolean("excluded").notNull().default(false),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("evidence_application_matches_public_id_uidx").on(t.publicId),
    uniqueIndex("evidence_application_matches_pair_uidx").on(t.evidenceItemId, t.applicationId, t.requirement),
    index("evidence_application_matches_tenant_idx").on(t.tenantId),
    index("evidence_application_matches_application_idx").on(t.applicationId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Resumes (versions immutable after create)                                  */
/* -------------------------------------------------------------------------- */

export const resumes = pgTable(
  "resumes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    templateId: text("template_id").notNull().default("alumni-clean"),
    length: text("length").notNull().default("one-page"),
    currentVersionId: uuid("current_version_id"),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("resumes_public_id_uidx").on(t.publicId),
    index("resumes_tenant_idx").on(t.tenantId),
    index("resumes_application_idx").on(t.applicationId),
  ],
);

/** IMMUTABLE content rows — never UPDATE content columns after insert. */
export const resumeVersions = pgTable(
  "resume_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    resumeId: uuid("resume_id")
      .notNull()
      .references(() => resumes.id, { onDelete: "cascade" }),
    versionLabel: text("version_label").notNull(),
    versionNumber: integer("version_number").notNull(),
    notes: text("notes"),
    score: integer("score").notNull().default(0),
    scoreBreakdown: jsonb("score_breakdown").$type<Record<string, number>>().default({}),
    triggeredBy: text("triggered_by"),
    promptVersion: text("prompt_version"),
    idempotencyKey: text("idempotency_key"),
    workflowRunId: uuid("workflow_run_id"),
    /** Soft metadata only — content fields must not be mutated after create. */
    locked: boolean("locked").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("resume_versions_public_id_uidx").on(t.publicId),
    uniqueIndex("resume_versions_resume_number_uidx").on(t.resumeId, t.versionNumber),
    index("resume_versions_tenant_idx").on(t.tenantId),
    index("resume_versions_resume_idx").on(t.resumeId),
  ],
);

export const resumeSections = pgTable(
  "resume_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    resumeVersionId: uuid("resume_version_id")
      .notNull()
      .references(() => resumeVersions.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    order: integer("order").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("resume_sections_public_id_uidx").on(t.publicId),
    index("resume_sections_tenant_idx").on(t.tenantId),
    index("resume_sections_version_idx").on(t.resumeVersionId),
  ],
);

export const resumeClaims = pgTable(
  "resume_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    resumeVersionId: uuid("resume_version_id")
      .notNull()
      .references(() => resumeVersions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id").references(() => resumeSections.id, { onDelete: "set null" }),
    bulletId: text("bullet_id"),
    text: text("text").notNull(),
    evidenceIds: jsonb("evidence_ids").$type<string[]>().default([]),
    researchRequirementIds: jsonb("research_requirement_ids").$type<string[]>().default([]),
    confidence: confidenceEnum("confidence").notNull().default("medium"),
    unsupported: boolean("unsupported").notNull().default(false),
    metricsUsed: jsonb("metrics_used").$type<string[]>().default([]),
    transformations: jsonb("transformations").$type<string[]>().default([]),
    verificationState: verificationStatusEnum("verification_state").default("unverified"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("resume_claims_public_id_uidx").on(t.publicId),
    index("resume_claims_tenant_idx").on(t.tenantId),
    index("resume_claims_version_idx").on(t.resumeVersionId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Audits & Mistake Memory                                                    */
/* -------------------------------------------------------------------------- */

export const auditRuns = pgTable(
  "audit_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    lens: auditLensEnum("lens").notNull(),
    label: text("label").notNull(),
    reviewsVersion: text("reviews_version").notNull(),
    producesVersion: text("produces_version"),
    status: text("status").notNull().default("pending"),
    scoreBefore: integer("score_before").notNull().default(0),
    scoreAfter: integer("score_after"),
    summary: text("summary"),
    workflowRunId: uuid("workflow_run_id"),
    promptVersion: text("prompt_version"),
    version: version(),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("audit_runs_public_id_uidx").on(t.publicId),
    index("audit_runs_tenant_idx").on(t.tenantId),
    index("audit_runs_application_idx").on(t.applicationId),
  ],
);

export const auditFindings = pgTable(
  "audit_findings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    auditRunId: uuid("audit_run_id")
      .notNull()
      .references(() => auditRuns.id, { onDelete: "cascade" }),
    severity: findingSeverityEnum("severity").notNull(),
    status: findingStatusEnum("status").notNull().default("open"),
    section: text("section"),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    beforeText: text("before_text"),
    suggestedText: text("suggested_text"),
    evidenceSource: text("evidence_source"),
    expectedScoreImpact: integer("expected_score_impact").default(0),
    editedText: text("edited_text"),
    bulletId: text("bullet_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("audit_findings_public_id_uidx").on(t.publicId),
    index("audit_findings_tenant_idx").on(t.tenantId),
    index("audit_findings_run_idx").on(t.auditRunId),
  ],
);

export const auditDecisions = pgTable(
  "audit_decisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    auditFindingId: uuid("audit_finding_id")
      .notNull()
      .references(() => auditFindings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    status: findingStatusEnum("status").notNull(),
    editedText: text("edited_text"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("audit_decisions_public_id_uidx").on(t.publicId),
    index("audit_decisions_tenant_idx").on(t.tenantId),
    index("audit_decisions_finding_idx").on(t.auditFindingId),
  ],
);

export const mistakeMemoryRules = pgTable(
  "mistake_memory_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    originatingAudit: auditLensEnum("originating_audit").notNull(),
    originatingAuditRunId: uuid("originating_audit_run_id").references(() => auditRuns.id, {
      onDelete: "set null",
    }),
    affectedVersion: text("affected_version").notNull(),
    category: text("category"),
    rule: text("rule").notNull(),
    machineConstraint: jsonb("machine_constraint").$type<Record<string, unknown>>(),
    severity: findingSeverityEnum("severity").default("minor"),
    status: text("status").notNull().default("active"),
    userOverride: boolean("user_override").notNull().default(false),
    userOverrideReason: text("user_override_reason"),
    appliedIn: jsonb("applied_in").$type<string[]>().default([]),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("mistake_memory_rules_public_id_uidx").on(t.publicId),
    index("mistake_memory_rules_tenant_idx").on(t.tenantId),
    index("mistake_memory_rules_application_idx").on(t.applicationId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Final QA                                                                   */
/* -------------------------------------------------------------------------- */

export const finalQaRuns = pgTable(
  "final_qa_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("pending"),
    passed: boolean("passed"),
    workflowRunId: uuid("workflow_run_id"),
    promptVersion: text("prompt_version"),
    version: version(),
    completedAt: ts("completed_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("final_qa_runs_public_id_uidx").on(t.publicId),
    index("final_qa_runs_tenant_idx").on(t.tenantId),
    index("final_qa_runs_application_idx").on(t.applicationId),
  ],
);

export const finalQaChecks = pgTable(
  "final_qa_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    finalQaRunId: uuid("final_qa_run_id")
      .notNull()
      .references(() => finalQaRuns.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    status: text("status").notNull().default("pending"),
    detail: text("detail"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("final_qa_checks_public_id_uidx").on(t.publicId),
    index("final_qa_checks_tenant_idx").on(t.tenantId),
    index("final_qa_checks_run_idx").on(t.finalQaRunId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Interviews                                                                 */
/* -------------------------------------------------------------------------- */

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id").references(() => applications.id, {
      onDelete: "set null",
    }),
    mode: text("mode").notNull(),
    status: text("status").notNull().default("setup"),
    difficulty: text("difficulty").default("medium"),
    durationMinutes: integer("duration_minutes").default(30),
    interviewerPersona: text("interviewer_persona"),
    voiceMode: boolean("voice_mode").notNull().default(false),
    resumeVersionId: uuid("resume_version_id").references(() => resumeVersions.id, {
      onDelete: "set null",
    }),
    currentQuestionIndex: integer("current_question_index").notNull().default(0),
    readinessScore: integer("readiness_score").default(0),
    recordingConsent: boolean("recording_consent").notNull().default(false),
    startedAt: ts("started_at"),
    endedAt: ts("ended_at"),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("interview_sessions_public_id_uidx").on(t.publicId),
    index("interview_sessions_tenant_idx").on(t.tenantId),
    index("interview_sessions_application_idx").on(t.applicationId),
  ],
);

export const interviewQuestions = pgTable(
  "interview_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    type: text("type").notNull(),
    competency: text("competency"),
    evidenceCueIds: jsonb("evidence_cue_ids").$type<string[]>().default([]),
    hint: text("hint"),
    followUp: text("follow_up"),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("interview_questions_public_id_uidx").on(t.publicId),
    index("interview_questions_tenant_idx").on(t.tenantId),
    index("interview_questions_session_idx").on(t.sessionId),
  ],
);

export const interviewResponses = pgTable(
  "interview_responses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id").references(() => interviewQuestions.id, {
      onDelete: "set null",
    }),
    role: text("role").notNull(),
    text: text("text").notNull(),
    at: ts("at").notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("interview_responses_public_id_uidx").on(t.publicId),
    index("interview_responses_tenant_idx").on(t.tenantId),
    index("interview_responses_session_idx").on(t.sessionId),
  ],
);

export const interviewFeedback = pgTable(
  "interview_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    overall: integer("overall").notNull().default(0),
    structure: integer("structure").default(0),
    relevance: integer("relevance").default(0),
    technicalDepth: integer("technical_depth").default(0),
    evidenceUsage: integer("evidence_usage").default(0),
    concision: integer("concision").default(0),
    clarity: integer("clarity").default(0),
    pacing: integer("pacing").default(0),
    fillerTrend: text("filler_trend"),
    strongestAnswer: text("strongest_answer"),
    weakestAnswer: text("weakest_answer"),
    missedEvidence: jsonb("missed_evidence").$type<string[]>().default([]),
    followUpRisk: text("follow_up_risk"),
    practicePlan: jsonb("practice_plan").$type<string[]>().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("interview_feedback_public_id_uidx").on(t.publicId),
    uniqueIndex("interview_feedback_session_uidx").on(t.sessionId),
    index("interview_feedback_tenant_idx").on(t.tenantId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Files                                                                      */
/* -------------------------------------------------------------------------- */

export const storedFiles = pgTable(
  "stored_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    purpose: text("purpose").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull().default(0),
    checksum: text("checksum"),
    scanStatus: text("scan_status").notNull().default("pending"),
    retentionState: text("retention_state").notNull().default("active"),
    physicalDeleteAt: ts("physical_delete_at"),
    originalFilename: text("original_filename"),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("stored_files_public_id_uidx").on(t.publicId),
    uniqueIndex("stored_files_storage_key_uidx").on(t.storageKey),
    index("stored_files_tenant_idx").on(t.tenantId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Workflows & SSE events                                                     */
/* -------------------------------------------------------------------------- */

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stage: workflowStageEnum("stage").notNull(),
    status: workflowRunStatusEnum("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    idempotencyKey: text("idempotency_key").notNull(),
    inputVersion: text("input_version"),
    outputVersion: text("output_version"),
    provider: text("provider"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    tokenUsage: jsonb("token_usage").$type<{ input?: number; output?: number; total?: number }>(),
    estimatedCostCents: numeric("estimated_cost_cents", { precision: 18, scale: 4 }),
    errorClass: text("error_class"),
    retryStatus: text("retry_status"),
    traceId: text("trace_id"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("workflow_runs_public_id_uidx").on(t.publicId),
    uniqueIndex("workflow_runs_tenant_idempotency_uidx").on(t.tenantId, t.idempotencyKey),
    index("workflow_runs_tenant_idx").on(t.tenantId),
    index("workflow_runs_application_idx").on(t.applicationId),
    index("workflow_runs_status_idx").on(t.status),
  ],
);

export const workflowEvents = pgTable(
  "workflow_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    workflowRunId: uuid("workflow_run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    stage: workflowStageEnum("stage").notNull(),
    status: text("status").notNull(),
    message: text("message"),
    seq: integer("seq").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("workflow_events_public_id_uidx").on(t.publicId),
    uniqueIndex("workflow_events_run_seq_uidx").on(t.workflowRunId, t.seq),
    index("workflow_events_tenant_idx").on(t.tenantId),
    index("workflow_events_application_idx").on(t.applicationId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Usage, notifications, audit logs, outbox, idempotency                      */
/* -------------------------------------------------------------------------- */

/** Append-only usage ledger — never update rows; reconcile via new entries. */
export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: usageKindEnum("kind").notNull(),
    units: numeric("units", { precision: 18, scale: 6 }).notNull().default("0"),
    costCents: numeric("cost_cents", { precision: 18, scale: 4 }).notNull().default("0"),
    workflowRunId: uuid("workflow_run_id").references(() => workflowRuns.id, {
      onDelete: "set null",
    }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull().default("committed"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("usage_ledger_public_id_uidx").on(t.publicId),
    uniqueIndex("usage_ledger_idempotency_uidx").on(t.idempotencyKey),
    index("usage_ledger_tenant_idx").on(t.tenantId),
    index("usage_ledger_created_idx").on(t.createdAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    href: text("href"),
    tone: text("tone").notNull().default("info"),
    read: boolean("read").notNull().default(false),
    createdAt: createdAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    uniqueIndex("notifications_public_id_uidx").on(t.publicId),
    index("notifications_tenant_idx").on(t.tenantId),
    index("notifications_user_idx").on(t.userId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    requestId: text("request_id"),
    ip: text("ip"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("audit_logs_public_id_uidx").on(t.publicId),
    index("audit_logs_tenant_idx").on(t.tenantId),
    index("audit_logs_created_idx").on(t.createdAt),
  ],
);

export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    topic: text("topic").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: outboxStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: ts("available_at").notNull().defaultNow(),
    publishedAt: ts("published_at"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("outbox_messages_public_id_uidx").on(t.publicId),
    index("outbox_messages_status_available_idx").on(t.status, t.availableAt),
    index("outbox_messages_tenant_idx").on(t.tenantId),
  ],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    key: text("key").notNull(),
    scope: text("scope").notNull(),
    requestHash: text("request_hash"),
    responseStatus: integer("response_status"),
    responseBody: jsonb("response_body").$type<Record<string, unknown>>(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("idempotency_keys_public_id_uidx").on(t.publicId),
    uniqueIndex("idempotency_keys_tenant_scope_key_uidx").on(t.tenantId, t.scope, t.key),
    index("idempotency_keys_tenant_idx").on(t.tenantId),
  ],
);

/* -------------------------------------------------------------------------- */
/* Radar — Job catalog and user interactions (Phase 3)                        */
/* -------------------------------------------------------------------------- */

export const radarTimestampPrecisionEnum = pgEnum("radar_timestamp_precision", [
  "EXACT_TIMESTAMP",
  "DATE_ONLY",
  "RELATIVE_HOURS",
  "RELATIVE_DAYS",
  "ESTIMATED",
  "FIRST_SEEN_ONLY",
  "UNKNOWN",
]);

export const radarJobClassificationEnum = pgEnum("radar_job_classification", [
  "NEW",
  "REPOSTED",
  "REFRESHED",
  "REOPENED",
  "DUPLICATE",
  "POSSIBLE_DUPLICATE",
  "UNCHANGED",
  "EXPIRED",
  "UNKNOWN",
]);

export const radarVerificationStateEnum = pgEnum("radar_verification_state", [
  "VERIFIED_OPEN",
  "LIKELY_OPEN",
  "STALE",
  "LIKELY_CLOSED",
  "CLOSED",
  "VERIFICATION_FAILED",
]);

export const radarLicenseStatusEnum = pgEnum("radar_license_status", [
  "public",
  "licensed",
  "partner",
  "demo_fixture",
  "disabled",
  "pending_review",
  "revoked",
]);

export const radarAccessMethodEnum = pgEnum("radar_access_method", [
  "public_api",
  "partner_api",
  "licensed_feed",
  "ats_board_api",
  "structured_data",
  "xml_feed",
  "sitemap",
  "user_provided",
  "approved_integration",
  "disabled_pending_license",
]);

export const radarJobStatusEnum = pgEnum("radar_job_status", ["open", "closed", "expired", "unknown"]);

export const radarCompanies = pgTable(
  "radar_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    domain: text("domain"),
    careersUrl: text("careers_url"),
    aliases: jsonb("aliases").$type<string[]>().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("radar_companies_public_id_uidx").on(t.publicId),
    index("radar_companies_normalized_name_idx").on(t.normalizedName),
  ],
);

export const radarJobSources = pgTable(
  "radar_job_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    providerId: text("provider_id").notNull(),
    displayName: text("display_name").notNull(),
    accessMethod: radarAccessMethodEnum("access_method").notNull(),
    baseUrl: text("base_url"),
    enabled: boolean("enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("radar_job_sources_public_id_uidx").on(t.publicId),
    uniqueIndex("radar_job_sources_provider_id_uidx").on(t.providerId),
  ],
);

export const radarCanonicalJobs = pgTable(
  "radar_canonical_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    companyId: uuid("company_id").notNull().references(() => radarCompanies.id),
    companyName: text("company_name").notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    department: text("department"),
    team: text("team"),
    employmentType: text("employment_type"),
    seniority: text("seniority"),
    description: text("description").notNull().default(""),
    requirements: text("requirements"),
    preferredQualifications: text("preferred_qualifications"),
    responsibilities: text("responsibilities"),
    compensation: jsonb("compensation"),
    locations: jsonb("locations").$type<string[]>().default([]),
    remotePolicy: text("remote_policy").notNull().default("unknown"),
    visaSponsorship: boolean("visa_sponsorship"),
    degreeRequired: boolean("degree_required"),
    securityClearanceRequired: boolean("security_clearance_required"),
    techStack: jsonb("tech_stack").$type<string[]>().default([]),
    canonicalApplicationUrl: text("canonical_application_url"),
    employerRequisitionId: text("employer_requisition_id"),
    originalPostedAt: ts("original_posted_at"),
    originalPostedPrecision: radarTimestampPrecisionEnum("original_posted_precision").notNull().default("UNKNOWN"),
    firstDiscoveredAt: ts("first_discovered_at").notNull().defaultNow(),
    lastVerifiedAt: ts("last_verified_at"),
    lastVerifiedPrecision: radarTimestampPrecisionEnum("last_verified_precision").notNull().default("UNKNOWN"),
    repostedAt: ts("reposted_at"),
    closedAt: ts("closed_at"),
    reopenedAt: ts("reopened_at"),
    status: radarJobStatusEnum("status").notNull().default("open"),
    verificationState: radarVerificationStateEnum("verification_state").notNull().default("LIKELY_OPEN"),
    classification: radarJobClassificationEnum("classification").notNull().default("NEW"),
    classificationConfidence: numeric("classification_confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull().default("0"),
    primarySourceId: uuid("primary_source_id").references(() => radarJobSources.id),
    repostCount: integer("repost_count").notNull().default(0),
    companyDirect: boolean("company_direct").notNull().default(false),
    demoData: boolean("demo_data").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("radar_canonical_jobs_public_id_uidx").on(t.publicId),
    index("radar_canonical_jobs_company_id_idx").on(t.companyId),
    index("radar_canonical_jobs_classification_idx").on(t.classification),
    index("radar_canonical_jobs_original_posted_at_idx").on(t.originalPostedAt),
    index("radar_canonical_jobs_first_discovered_at_idx").on(t.firstDiscoveredAt),
    index("radar_canonical_jobs_status_idx").on(t.status),
  ],
);

export const radarProviderCheckpoints = pgTable(
  "radar_provider_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: text("provider_id").notNull().unique(),
    lastFetchedAt: ts("last_fetched_at").notNull().defaultNow(),
    lastCursor: text("last_cursor"),
    lastJobCount: integer("last_job_count"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("radar_provider_checkpoints_provider_uidx").on(t.providerId)],
);

export const radarOpportunityBriefs = pgTable(
  "radar_opportunity_briefs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    brief: jsonb("brief").notNull(),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("radar_opportunity_briefs_tenant_user_job_uidx").on(t.tenantId, t.userId, t.canonicalJobId),
    index("radar_opportunity_briefs_tenant_idx").on(t.tenantId),
  ],
);

export const radarJobInteractions = pgTable(
  "radar_job_interactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    interactionType: text("interaction_type").notNull(),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [
    index("radar_job_interactions_tenant_user_idx").on(t.tenantId, t.userId),
    index("radar_job_interactions_job_idx").on(t.canonicalJobId),
    index("radar_job_interactions_created_idx").on(t.createdAt),
  ],
);

export const radarJobSightings = pgTable(
  "radar_job_sightings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => radarJobSources.id),
    sourceListingId: text("source_listing_id").notNull(),
    sourceCompanyIdentifier: text("source_company_identifier"),
    sourceRequisitionId: text("source_requisition_id"),
    sourceUrl: text("source_url").notNull(),
    sourceApplyUrl: text("source_apply_url"),
    sourceTitle: text("source_title").notNull(),
    sourceLocation: text("source_location"),
    sourcePostedAt: ts("source_posted_at"),
    sourcePostedPrecision: radarTimestampPrecisionEnum("source_posted_precision")
      .notNull()
      .default("UNKNOWN"),
    sourceUpdatedAt: ts("source_updated_at"),
    firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    lastVerifiedAt: ts("last_verified_at"),
    removedAt: ts("removed_at"),
    repostedAt: ts("reposted_at"),
    validThrough: ts("valid_through"),
    contentHash: text("content_hash").notNull(),
    descriptionHash: text("description_hash").notNull(),
    rawSnapshotId: uuid("raw_snapshot_id"),
    classification: radarJobClassificationEnum("classification").notNull().default("NEW"),
    classificationConfidence: numeric("classification_confidence", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    demoData: boolean("demo_data").notNull().default(false),
    attribution: text("attribution"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("radar_job_sightings_public_id_uidx").on(t.publicId),
    uniqueIndex("radar_job_sightings_source_listing_uidx").on(t.sourceId, t.sourceListingId),
    index("radar_job_sightings_canonical_job_id_idx").on(t.canonicalJobId),
    index("radar_job_sightings_source_posted_at_idx").on(t.sourcePostedAt),
  ],
);

export const radarJobSnapshots = pgTable(
  "radar_job_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sightingId: uuid("sighting_id")
      .notNull()
      .references(() => radarJobSightings.id, { onDelete: "cascade" }),
    retrievedAt: ts("retrieved_at").notNull().defaultNow(),
    contentHash: text("content_hash").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    location: text("location"),
    compensation: jsonb("compensation"),
    sourcePostedAt: ts("source_posted_at"),
    applicationUrl: text("application_url"),
    status: radarJobStatusEnum("status").notNull().default("open"),
    rawPayloadRef: text("raw_payload_ref"),
    materialChangeSummary: text("material_change_summary"),
  },
  (t) => [index("radar_job_snapshots_sighting_id_idx").on(t.sightingId)],
);

export const radarJobHistoryEvents = pgTable(
  "radar_job_history_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    sightingId: uuid("sighting_id").references(() => radarJobSightings.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    occurredAt: ts("occurred_at").notNull().defaultNow(),
    message: text("message").notNull(),
    metadata: jsonb("metadata"),
  },
  (t) => [
    index("radar_job_history_events_job_idx").on(t.canonicalJobId, t.occurredAt),
  ],
);

export const radarSavedSearches = pgTable(
  "radar_saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    query: jsonb("query").notNull().default({}),
    alertEnabled: boolean("alert_enabled").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("radar_saved_searches_public_id_uidx").on(t.publicId),
    index("radar_saved_searches_tenant_user_idx").on(t.tenantId, t.userId),
  ],
);

export const radarSavedJobs = pgTable(
  "radar_saved_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("radar_saved_jobs_tenant_user_job_uidx").on(t.tenantId, t.userId, t.canonicalJobId),
    index("radar_saved_jobs_tenant_idx").on(t.tenantId),
  ],
);

export const radarHiddenJobs = pgTable(
  "radar_hidden_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("radar_hidden_jobs_tenant_user_job_uidx").on(t.tenantId, t.userId, t.canonicalJobId),
    index("radar_hidden_jobs_tenant_idx").on(t.tenantId),
  ],
);

export const radarJobMatches = pgTable(
  "radar_job_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    score: numeric("score", { precision: 5, scale: 4 }).notNull(),
    breakdown: jsonb("breakdown").notNull(),
    computedAt: ts("computed_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("radar_job_matches_tenant_user_job_uidx").on(t.tenantId, t.userId, t.canonicalJobId),
    index("radar_job_matches_tenant_idx").on(t.tenantId),
  ],
);

export const radarJobAlerts = pgTable(
  "radar_job_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicId: publicId(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    savedSearchId: uuid("saved_search_id").references(() => radarSavedSearches.id, {
      onDelete: "set null",
    }),
    query: jsonb("query").notNull().default({}),
    cadence: text("cadence").notNull().default("immediate"),
    enabled: boolean("enabled").notNull().default(true),
    includeReposts: boolean("include_reposts").notNull().default(true),
    includeRefreshes: boolean("include_refreshes").notNull().default(false),
    lastEvaluatedAt: ts("last_evaluated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("radar_job_alerts_public_id_uidx").on(t.publicId),
    index("radar_job_alerts_tenant_user_idx").on(t.tenantId, t.userId),
  ],
);

export const radarJobAlertDeliveries = pgTable(
  "radar_job_alert_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => radarJobAlerts.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    canonicalJobId: uuid("canonical_job_id")
      .notNull()
      .references(() => radarCanonicalJobs.id, { onDelete: "cascade" }),
    classification: radarJobClassificationEnum("classification").notNull(),
    deliveredAt: ts("delivered_at").notNull().defaultNow(),
    channel: text("channel").notNull().default("in_app"),
    message: text("message").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
  },
  (t) => [
    uniqueIndex("radar_job_alert_deliveries_dedupe_uidx").on(t.dedupeKey),
    index("radar_job_alert_deliveries_tenant_user_idx").on(t.tenantId, t.userId),
  ],
);

/** Convenience re-export for Drizzle clients */
export const schema = {
  users,
  tenants,
  tenantMemberships,
  sessions,
  candidateProfiles,
  jobDescriptions,
  applications,
  researchRuns,
  researchSources,
  researchFindings,
  evidenceItems,
  evidenceMetrics,
  evidenceAttachments,
  evidenceApplicationMatches,
  resumes,
  resumeVersions,
  resumeSections,
  resumeClaims,
  auditRuns,
  auditFindings,
  auditDecisions,
  mistakeMemoryRules,
  finalQaRuns,
  finalQaChecks,
  interviewSessions,
  interviewQuestions,
  interviewResponses,
  interviewFeedback,
  storedFiles,
  workflowRuns,
  workflowEvents,
  usageLedger,
  notifications,
  auditLogs,
  outboxMessages,
  idempotencyKeys,
  // Radar tables
  radarCompanies,
  radarJobSources,
  radarCanonicalJobs,
  radarProviderCheckpoints,
  radarOpportunityBriefs,
  radarJobInteractions,
  radarJobSightings,
  radarJobSnapshots,
  radarJobHistoryEvents,
  radarSavedSearches,
  radarSavedJobs,
  radarHiddenJobs,
  radarJobMatches,
  radarJobAlerts,
  radarJobAlertDeliveries,
};

export type User = typeof users.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type TenantMembership = typeof tenantMemberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowEvent = typeof workflowEvents.$inferSelect;
export type ResumeVersion = typeof resumeVersions.$inferSelect;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type UsageLedgerEntry = typeof usageLedger.$inferSelect;
