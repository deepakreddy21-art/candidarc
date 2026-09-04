/**
 * Empty seed stub used when NEXT_PUBLIC_APP_MODE=production so demo
 * candidate data never ships in browser bundles.
 */
import type {
  ActivityEvent,
  AppInsights,
  Application,
  Audit,
  CandidateProfile,
  EvidenceItem,
  EvidenceRoleMatrixRow,
  FinalQACheck,
  JobDescription,
  MistakeMemoryRule,
  Notification,
  ResearchFinding,
  ResearchSource,
  Resume,
  TechnologySignal,
} from "@/types/domain";

export const candidate: CandidateProfile = {
  id: "cand-empty",
  fullName: "",
  preferredName: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  summary: "",
  experienceLevel: "experienced",
  yearsExperience: 0,
  targetRoleFamilies: [],
  preferredResumeLength: "one-page",
  careerGoal: "",
  avatarInitials: "?",
};

export const applications: Application[] = [];
export const jobDescriptions: JobDescription[] = [];
export const evidenceItems: EvidenceItem[] = [];
export const evidenceRoleMatrix: EvidenceRoleMatrixRow[] = [];
export const researchFindings: ResearchFinding[] = [];
export const researchSources: ResearchSource[] = [];
export const technologySignals: TechnologySignal[] = [];
export const resumes: Resume[] = [];
export const audits: Audit[] = [];
export const mistakeMemory: MistakeMemoryRule[] = [];
export const finalQAChecks: FinalQACheck[] = [];
export const activities: ActivityEvent[] = [];
export const notifications: Notification[] = [];
export const insights: AppInsights = {
  scoreByVersion: [],
  evidenceByRole: [],
  missingCompetencies: [],
  interviewReadinessTrend: [],
  repeatedAuditIssues: [],
  stageDistribution: [],
  questionCoverage: [],
  storiesNeedingMetrics: [],
};
