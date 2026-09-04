export type Confidence = "high" | "medium" | "low";
export type VerificationStatus = "verified" | "inferred" | "unverified" | "disputed";
export type PrivacyLevel = "public" | "share-safe" | "private" | "do-not-use";
export type ExperienceLevel = "student" | "early-career" | "experienced" | "career-transition";
export type ResumeLength = "one-page" | "two-page";
export type ResearchDepth = "standard" | "deep-team" | "priority";
export type ApplicationStatus =
  | "draft"
  | "researching"
  | "evidence"
  | "resume"
  | "auditing"
  | "final-qa"
  | "ready"
  | "interviewing"
  | "archived";
export type WorkflowStage =
  | "research"
  | "evidence-match"
  | "resume-v0"
  | "hr-audit-1"
  | "resume-v1"
  | "em-audit-1"
  | "resume-v2"
  | "hr-audit-2"
  | "resume-v3"
  | "em-audit-2"
  | "resume-v4"
  | "final-qa"
  | "ready";
export type FindingSeverity = "critical" | "major" | "minor" | "suggestion";
export type FindingStatus = "open" | "accepted" | "edited" | "rejected" | "deferred";
export type AuditLens = "hr-1" | "em-1" | "hr-2" | "em-2" | "final-qa";

export interface CandidateProfile {
  id: string;
  fullName: string;
  preferredName: string;
  email: string;
  phone: string;
  location: string;
  linkedIn?: string;
  github?: string;
  portfolio?: string;
  headline: string;
  summary: string;
  experienceLevel: ExperienceLevel;
  yearsExperience: number;
  targetRoleFamilies: string[];
  preferredResumeLength: ResumeLength;
  careerGoal: string;
  avatarInitials: string;
}

export interface JobDescription {
  id: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  source: string;
  url?: string;
  postedAt?: string;
  deadline?: string;
  rawText: string;
  requirements: string[];
  preferred: string[];
}

export interface ResearchSource {
  id: string;
  title: string;
  url: string;
  accessedAt: string;
  type: "job-posting" | "company" | "team" | "project" | "tech" | "news" | "inferred";
}

export interface ResearchFinding {
  id: string;
  applicationId: string;
  category: "role" | "company" | "team" | "project" | "technology" | "hiring-signal";
  title: string;
  summary: string;
  confidence: Confidence;
  status: VerificationStatus;
  sourceIds: string[];
  useInResumeStrategy: boolean;
  dateAccessed: string;
  uncertaintyNote?: string;
}

export interface TechnologySignal {
  id: string;
  name: string;
  status: VerificationStatus;
  confidence: Confidence;
  sourceCount: number;
  sourceIds: string[];
  useInResume: boolean;
  notes?: string;
}

export interface EvidenceMetric {
  id: string;
  label: string;
  value: string;
  unit?: string;
  baseline?: string;
  verified: boolean;
}

export interface EvidenceItem {
  id: string;
  title: string;
  organization: string;
  situation: string;
  task: string;
  actions: string[];
  result: string;
  metrics: EvidenceMetric[];
  technologies: string[];
  roleRelevance: string[];
  confidence: Confidence;
  verificationStatus: VerificationStatus;
  supportingSource?: string;
  privacyLevel: PrivacyLevel;
  lastUpdated: string;
  resumeUsageHistory: string[];
  interviewStoryReady: boolean;
  tags: string[];
}

export interface ResumeBullet {
  id: string;
  text: string;
  evidenceIds: string[];
  researchRequirementIds?: string[];
  confidence: Confidence;
  unsupported: boolean;
  transformations?: string[];
  metricsUsed?: string[];
}

export interface ResumeSection {
  id: string;
  type: "summary" | "skills" | "experience" | "projects" | "education" | "certifications";
  title: string;
  order: number;
  content?: string;
  bullets?: ResumeBullet[];
  items?: Array<{
    id: string;
    heading: string;
    subheading?: string;
    location?: string;
    dates?: string;
    bullets: ResumeBullet[];
  }>;
}

export interface ResumeScoreBreakdown {
  atsCompatibility: number;
  jobAlignment: number;
  recruiterReadability: number;
  impact: number;
  quantification: number;
  technicalDepth: number;
  competencyCoverage: number;
  evidenceConfidence: number;
  writingQuality: number;
  formatIntegrity: number;
}

export interface ResumeVersion {
  id: string;
  versionLabel: string;
  versionNumber: number;
  createdAt: string;
  notes: string;
  score: number;
  scoreBreakdown: ResumeScoreBreakdown;
  triggeredBy: string;
  sections: ResumeSection[];
}

export interface Resume {
  id: string;
  applicationId: string;
  title: string;
  templateId: string;
  length: ResumeLength;
  currentVersionId: string;
  versions: ResumeVersion[];
}

export interface AuditFinding {
  id: string;
  auditId: string;
  severity: FindingSeverity;
  status: FindingStatus;
  section: string;
  title: string;
  explanation: string;
  beforeText: string;
  suggestedText: string;
  evidenceSource?: string;
  expectedScoreImpact: number;
  bulletId?: string;
}

export interface Audit {
  id: string;
  applicationId: string;
  lens: AuditLens;
  label: string;
  reviewsVersion: string;
  producesVersion?: string;
  status: "pending" | "in-progress" | "completed";
  scoreBefore: number;
  scoreAfter?: number;
  findings: AuditFinding[];
  completedAt?: string;
  summary: string;
}

export interface MistakeMemoryRule {
  id: string;
  applicationId: string;
  originatingAudit: AuditLens;
  affectedVersion: string;
  rule: string;
  status: "active" | "overridden" | "retired";
  appliedIn: string[];
  userOverride?: boolean;
}

export interface FinalQACheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "warning" | "pending";
  detail: string;
}

export interface Application {
  id: string;
  company: string;
  companyMark: string;
  role: string;
  location: string;
  employmentType: string;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  status: ApplicationStatus;
  stage: WorkflowStage;
  resumeScore: number;
  evidenceCoverage: number;
  atsAlignment: number;
  interviewStatus: "not-started" | "preparing" | "ready" | "completed";
  researchConfidence: number;
  ownerProfileId: string;
  jobDescriptionId: string;
  resumeId: string;
  nextAction: string;
  archived: boolean;
  roleFamily: string;
}

export interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  applicationId?: string;
  href?: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
  tone: "info" | "success" | "warning";
}

export interface EvidenceRoleMatrixRow {
  id: string;
  requirement: string;
  importance: "required" | "preferred" | "nice-to-have";
  evidenceIds: string[];
  evidenceStrength: Confidence;
  resumeUsage: "used" | "partial" | "unused";
  coverageGap?: string;
}

export interface InsightSeriesPoint {
  label: string;
  value: number;
}

export interface AppInsights {
  scoreByVersion: InsightSeriesPoint[];
  evidenceByRole: InsightSeriesPoint[];
  missingCompetencies: Array<{ name: string; count: number }>;
  interviewReadinessTrend: InsightSeriesPoint[];
  repeatedAuditIssues: Array<{ issue: string; count: number }>;
  stageDistribution: InsightSeriesPoint[];
  questionCoverage: InsightSeriesPoint[];
  storiesNeedingMetrics: string[];
}
