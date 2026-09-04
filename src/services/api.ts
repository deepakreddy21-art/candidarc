import type {
  Application,
  Audit,
  AuditFinding,
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
  ResumeImportExtraction,
  TechnologySignal,
  ActivityEvent,
  AppInsights,
} from "@/types/domain";
import { allowDemoFallback as isDemoFallbackAllowed } from "@/lib/app-mode";

export { isDemoFallbackAllowed as allowDemoFallback };

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms));

const emptyProfile: CandidateProfile = {
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

const emptyInsights: AppInsights = {
  scoreByVersion: [],
  evidenceByRole: [],
  missingCompetencies: [],
  interviewReadinessTrend: [],
  repeatedAuditIssues: [],
  stageDistribution: [],
  questionCoverage: [],
  storiesNeedingMetrics: [],
};

let applications: Application[] = [];
let evidence: EvidenceItem[] = [];
let audits: Audit[] = [];
let resumes: Resume[] = [];
let memory: MistakeMemoryRule[] = [];
let notifications: Notification[] = [];
let profile = structuredClone(emptyProfile);
let jobDescriptions: JobDescription[] = [];
let researchFindings: ResearchFinding[] = [];
let researchSources: ResearchSource[] = [];
let technologySignals: TechnologySignal[] = [];
let evidenceRoleMatrix: EvidenceRoleMatrixRow[] = [];
let finalQAChecks: FinalQACheck[] = [];
let activities: ActivityEvent[] = [];
let insights = structuredClone(emptyInsights);
const findingApplications = new Map<string, string>();
let demoLoaded = false;

async function ensureDemoStore() {
  if (!isDemoFallbackAllowed() || demoLoaded) return;
  const seed = await import("@/data/seed.demo");
  applications = structuredClone(seed.applications);
  evidence = structuredClone(seed.evidenceItems);
  audits = structuredClone(seed.audits);
  resumes = structuredClone(seed.resumes);
  memory = structuredClone(seed.mistakeMemory);
  notifications = structuredClone(seed.notifications);
  profile = structuredClone(seed.candidate);
  jobDescriptions = structuredClone(seed.jobDescriptions);
  researchFindings = structuredClone(seed.researchFindings);
  researchSources = structuredClone(seed.researchSources);
  technologySignals = structuredClone(seed.technologySignals);
  evidenceRoleMatrix = structuredClone(seed.evidenceRoleMatrix);
  finalQAChecks = structuredClone(seed.finalQAChecks);
  activities = structuredClone(seed.activities);
  insights = structuredClone(seed.insights);
  demoLoaded = true;
}

const shouldUseMockApi = () => process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; network: boolean; status?: number };

type CreateApplicationRequest = Partial<Application> & Pick<Application, "company" | "role"> & {
  jobUrl?: string;
  jobDescriptionText?: string;
  researchDepth?: string;
  excludedEvidenceIds?: string[];
  resumeLength?: string;
  experienceLevel?: string;
};

export type WorkflowResponse = {
  workflow: {
    id: string;
    applicationId: string;
    stage: string;
    status: string;
    attempt: number;
    inputVersion?: string;
    outputVersion?: string;
    startedAt?: string;
    completedAt?: string;
    errorClass?: string;
    payload?: Record<string, unknown>;
  } | null;
  events: Array<{
    id: string;
    seq: number;
    stage: string;
    status: string;
    message: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
};

async function apiUpload<T>(path: string, form: FormData): Promise<ApiResult<T>> {
  if (shouldUseMockApi()) return { ok: false, network: false };
  try {
    const csrf = typeof document === "undefined"
      ? undefined
      : document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1];
    const res = await fetch(`/api/v1${path}`, {
      method: "POST",
      body: form,
      credentials: "include",
      headers: {
        ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      if (!isDemoFallbackAllowed()) throw new ApiError(body?.error?.message ?? body?.message ?? `Request failed (${res.status})`, res.status);
      return { ok: false, network: false, status: res.status };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (error) {
    if (!isDemoFallbackAllowed()) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error instanceof Error ? error.message : "Network request failed");
    }
    return { ok: false, network: true };
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  if (shouldUseMockApi()) return { ok: false, network: false };
  try {
    const csrf = typeof document === "undefined"
      ? undefined
      : document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1];
    const res = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: { message?: string }; message?: string } | null;
      if (!isDemoFallbackAllowed()) throw new ApiError(body?.error?.message ?? body?.message ?? `Request failed (${res.status})`, res.status);
      return { ok: false, network: false, status: res.status };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (error) {
    if (!isDemoFallbackAllowed()) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error instanceof Error ? error.message : "Network request failed");
    }
    return { ok: false, network: true };
  }
}

const mock = {
  async getProfile(): Promise<CandidateProfile> {
    await ensureDemoStore();
    await delay();
    return structuredClone(profile);
  },
  async updateProfile(patch: Partial<CandidateProfile>): Promise<CandidateProfile> {
    await ensureDemoStore();
    await delay();
    profile = { ...profile, ...patch };
    return structuredClone(profile);
  },
  async listApplications(includeArchived = false): Promise<Application[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(applications.filter((a) => includeArchived || !a.archived));
  },
  async getApplication(id: string): Promise<Application | undefined> {
    await ensureDemoStore();
    await delay();
    return structuredClone(applications.find((a) => a.id === id));
  },
  async createApplication(input: CreateApplicationRequest): Promise<Application> {
    await ensureDemoStore();
    await delay(400);
    const app: Application = {
      id: `app-${Date.now()}`,
      company: input.company,
      companyMark: input.company.slice(0, 2).toUpperCase(),
      role: input.role,
      location: input.location ?? "Remote",
      employmentType: input.employmentType ?? "Full-time",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadline: input.deadline,
      status: "researching",
      stage: "research",
      resumeScore: 0,
      evidenceCoverage: 48,
      atsAlignment: 0,
      interviewStatus: "not-started",
      researchConfidence: 12,
      ownerProfileId: profile.id,
      jobDescriptionId: input.jobDescriptionId ?? `jd-${Date.now()}`,
      resumeId: `resume-${Date.now()}`,
      nextAction: "Finish role research",
      archived: false,
      roleFamily: input.roleFamily ?? "AI/ML Engineering",
    };
    applications = [app, ...applications];
    return structuredClone(app);
  },
  async archiveApplications(ids: string[]): Promise<void> {
    await ensureDemoStore();
    await delay();
    applications = applications.map((a) => (ids.includes(a.id) ? { ...a, archived: true, status: "archived" } : a));
  },
  async getJobDescription(id: string): Promise<JobDescription | undefined> {
    await ensureDemoStore();
    await delay();
    return structuredClone(jobDescriptions.find((j) => j.id === id));
  },
  async listEvidence(): Promise<EvidenceItem[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(evidence);
  },
  async getEvidence(id: string): Promise<EvidenceItem | undefined> {
    await ensureDemoStore();
    await delay();
    return structuredClone(evidence.find((e) => e.id === id));
  },
  async upsertEvidence(item: EvidenceItem): Promise<EvidenceItem> {
    await ensureDemoStore();
    await delay();
    const idx = evidence.findIndex((e) => e.id === item.id);
    if (idx >= 0) evidence[idx] = item;
    else evidence = [item, ...evidence];
    return structuredClone(item);
  },
  async getResume(applicationId: string): Promise<Resume | undefined> {
    await ensureDemoStore();
    await delay();
    return structuredClone(resumes.find((r) => r.applicationId === applicationId));
  },
  async setResumeVersion(applicationId: string, versionId: string): Promise<Resume> {
    await ensureDemoStore();
    await delay();
    resumes = resumes.map((r) =>
      r.applicationId === applicationId ? { ...r, currentVersionId: versionId } : r,
    );
    const resume = resumes.find((r) => r.applicationId === applicationId);
    if (!resume) throw new ApiError("Resume not found", 404);
    return structuredClone(resume);
  },
  async listAudits(applicationId: string): Promise<Audit[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(audits.filter((a) => a.applicationId === applicationId));
  },
  async updateFinding(findingId: string, status: AuditFinding["status"], editedText?: string): Promise<AuditFinding> {
    await ensureDemoStore();
    await delay();
    let updated!: AuditFinding;
    audits = audits.map((audit) => ({
      ...audit,
      findings: audit.findings.map((f) => {
        if (f.id !== findingId) return f;
        updated = { ...f, status, suggestedText: editedText ?? f.suggestedText };
        return updated;
      }),
    }));
    return structuredClone(updated);
  },
  async listMistakeMemory(applicationId: string): Promise<MistakeMemoryRule[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(memory.filter((m) => m.applicationId === applicationId));
  },
  async overrideMistakeMemory(id: string, override: boolean): Promise<MistakeMemoryRule> {
    await ensureDemoStore();
    await delay();
    memory = memory.map((m) => (m.id === id ? { ...m, userOverride: override, status: override ? "overridden" : "active" } : m));
    const rule = memory.find((m) => m.id === id);
    if (!rule) throw new ApiError("Rule not found", 404);
    return structuredClone(rule);
  },
  async listResearch(applicationId: string): Promise<{
    findings: ResearchFinding[];
    sources: ResearchSource[];
    technologies: TechnologySignal[];
    matrix: EvidenceRoleMatrixRow[];
  }> {
    await ensureDemoStore();
    await delay();
    return {
      findings: structuredClone(researchFindings.filter((f) => f.applicationId === applicationId)),
      sources: structuredClone(researchSources),
      technologies: structuredClone(technologySignals),
      matrix: structuredClone(evidenceRoleMatrix),
    };
  },
  async getFinalQA(): Promise<FinalQACheck[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(finalQAChecks);
  },
  async listActivities(): Promise<ActivityEvent[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(activities);
  },
  async listNotifications(): Promise<Notification[]> {
    await ensureDemoStore();
    await delay();
    return structuredClone(notifications);
  },
  async markNotificationRead(id: string): Promise<void> {
    await ensureDemoStore();
    await delay(80);
    notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  },
  async getInsights(): Promise<AppInsights> {
    await ensureDemoStore();
    await delay();
    return structuredClone(insights);
  },
};

export const api = {
  async getProfile(): Promise<CandidateProfile> {
    const res = await apiFetch<{ profile: CandidateProfile }>("/profile");
    if (res.ok) return res.data.profile;
    if (!isDemoFallbackAllowed()) return structuredClone(emptyProfile);
    return mock.getProfile();
  },
  async updateProfile(patch: Partial<CandidateProfile>): Promise<CandidateProfile> {
    const res = await apiFetch<{ profile: CandidateProfile }>("/profile", {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (res.ok) return res.data.profile;
    if (!isDemoFallbackAllowed()) throw new ApiError("Could not save profile", res.status);
    return mock.updateProfile(patch);
  },
  async getOnboardingProgress(): Promise<{ step: number; completedAt: string | null; data: CandidateProfile }> {
    const res = await apiFetch<{ step: number; completedAt: string | null; data: CandidateProfile }>("/profile/onboarding");
    if (res.ok) return res.data;
    if (!isDemoFallbackAllowed()) {
      const profile = await this.getProfile();
      return { step: profile.onboardingStep ?? 0, completedAt: profile.onboardingCompletedAt ?? null, data: profile };
    }
    return { step: 0, completedAt: null, data: await mock.getProfile() };
  },
  async updateOnboardingProgress(input: {
    step?: number;
    completed?: boolean;
    data?: Record<string, unknown>;
  }): Promise<{ step: number; completedAt: string | null; profile: CandidateProfile }> {
    const res = await apiFetch<{ step: number; completedAt: string | null; profile: CandidateProfile }>(
      "/profile/onboarding",
      { method: "PATCH", body: JSON.stringify(input) },
    );
    if (res.ok) return res.data;
    if (!isDemoFallbackAllowed()) throw new ApiError("Could not save onboarding progress", res.status);
    if (input.data) await mock.updateProfile(input.data as Partial<CandidateProfile>);
    return { step: input.step ?? 0, completedAt: input.completed ? new Date().toISOString() : null, profile: await mock.getProfile() };
  },
  async uploadResume(file: File): Promise<{ file: { id: string; scanStatus: string }; importStatus: string }> {
    const form = new FormData();
    form.append("file", file);
    const res = await apiUpload<{ file: { id: string; scanStatus: string }; importStatus: string }>(
      "/profile/resume/upload",
      form,
    );
    if (res.ok) return res.data;
    throw new ApiError("Resume upload failed", res.status);
  },
  async getResumeImportStatus(): Promise<{
    status: string | null;
    extraction: ResumeImportExtraction | null;
    file: { id: string; scanStatus: string; mimeType: string; size: number } | null;
  }> {
    const res = await apiFetch<{
      status: string | null;
      extraction: ResumeImportExtraction | null;
      file: { id: string; scanStatus: string; mimeType: string; size: number } | null;
    }>("/profile/resume/import");
    if (res.ok) return res.data;
    return { status: null, extraction: null, file: null };
  },
  async confirmResumeImport(): Promise<{ profile: CandidateProfile; extraction: ResumeImportExtraction }> {
    const res = await apiFetch<{ profile: CandidateProfile; extraction: ResumeImportExtraction }>(
      "/profile/resume/confirm",
      { method: "POST", body: JSON.stringify({}) },
    );
    if (res.ok) return res.data;
    throw new ApiError("Could not confirm resume import", res.status);
  },
  async listApplications(includeArchived = false): Promise<Application[]> {
    const q = includeArchived ? "?includeArchived=true" : "";
    const res = await apiFetch<{ applications: Application[] }>(`/applications${q}`);
    if (res.ok) return res.data.applications;
    if (!isDemoFallbackAllowed()) return [];
    return mock.listApplications(includeArchived);
  },
  async getApplication(id: string): Promise<Application | undefined> {
    const res = await apiFetch<{ application: Application }>(`/applications/${id}`);
    if (res.ok) return res.data.application;
    if (!isDemoFallbackAllowed()) return undefined;
    return mock.getApplication(id);
  },
  async createApplication(input: CreateApplicationRequest): Promise<Application> {
    const res = await apiFetch<{ application: Application }>("/applications", {
      method: "POST",
      body: JSON.stringify({
        company: input.company,
        role: input.role,
        location: input.location,
        employmentType: input.employmentType,
        deadline: input.deadline,
        roleFamily: input.roleFamily,
        jobUrl: input.jobUrl,
        jobDescriptionText: input.jobDescriptionText,
        researchDepth: input.researchDepth ?? "standard",
        excludedEvidenceIds: input.excludedEvidenceIds,
        resumeLength: input.resumeLength,
        experienceLevel: input.experienceLevel,
      }),
    });
    if (res.ok) return res.data.application;
    if (!isDemoFallbackAllowed()) throw new ApiError("Could not create application", res.status);
    return mock.createApplication(input);
  },
  async archiveApplications(ids: string[]): Promise<void> {
    let usedApi = false;
    for (const id of ids) {
      const res = await apiFetch(`/applications/${id}`, { method: "DELETE" });
      if (res.ok) usedApi = true;
    }
    if (!usedApi) {
      if (!isDemoFallbackAllowed()) throw new ApiError("Could not archive applications", 503);
      await mock.archiveApplications(ids);
    }
  },
  async getJobDescription(id: string): Promise<JobDescription | undefined> {
    if (!isDemoFallbackAllowed()) return undefined;
    return mock.getJobDescription(id);
  },
  async listEvidence(): Promise<EvidenceItem[]> {
    const res = await apiFetch<{ evidence: EvidenceItem[] }>("/evidence");
    if (res.ok) return res.data.evidence;
    if (!isDemoFallbackAllowed()) return [];
    return mock.listEvidence();
  },
  async getEvidence(id: string): Promise<EvidenceItem | undefined> {
    const res = await apiFetch<{ evidence: EvidenceItem }>(`/evidence/${id}`);
    if (res.ok) return res.data.evidence;
    if (!isDemoFallbackAllowed()) return undefined;
    return mock.getEvidence(id);
  },
  async upsertEvidence(item: EvidenceItem): Promise<EvidenceItem> {
    const existing = await apiFetch<{ evidence: EvidenceItem }>(`/evidence/${item.id}`);
    if (existing.ok) {
      const patched = await apiFetch<{ evidence: EvidenceItem }>(`/evidence/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: item.title,
          organization: item.organization,
          situation: item.situation,
          task: item.task,
          actions: item.actions,
          result: item.result,
          technologies: item.technologies,
          confidence: item.confidence,
          verificationStatus: item.verificationStatus,
          privacyLevel: item.privacyLevel,
          payload: {
            metrics: item.metrics,
            roleRelevance: item.roleRelevance,
            tags: item.tags,
            resumeUsageHistory: item.resumeUsageHistory,
            interviewStoryReady: item.interviewStoryReady,
            supportingSource: item.supportingSource,
          },
        }),
      });
      if (patched.ok) return patched.data.evidence;
    } else {
      const created = await apiFetch<{ evidence: EvidenceItem }>("/evidence", {
        method: "POST",
        body: JSON.stringify({
          title: item.title,
          organization: item.organization,
          situation: item.situation,
          task: item.task,
          actions: item.actions,
          result: item.result,
          technologies: item.technologies,
          confidence: item.confidence,
          verificationStatus: item.verificationStatus,
          privacyLevel: item.privacyLevel,
          payload: {
            metrics: item.metrics,
            roleRelevance: item.roleRelevance,
            tags: item.tags,
            resumeUsageHistory: item.resumeUsageHistory,
            interviewStoryReady: item.interviewStoryReady,
            supportingSource: item.supportingSource,
          },
        }),
      });
      if (created.ok) return created.data.evidence;
    }
    if (!isDemoFallbackAllowed()) throw new ApiError("Could not save evidence", 503);
    return mock.upsertEvidence(item);
  },
  async getResume(applicationId: string): Promise<Resume | undefined> {
    const res = await apiFetch<{ resume: Resume | null }>(`/applications/${applicationId}/resume`);
    if (res.ok) return res.data.resume ?? undefined;
    if (!isDemoFallbackAllowed()) return undefined;
    return mock.getResume(applicationId);
  },
  async setResumeVersion(applicationId: string, versionId: string): Promise<Resume> {
    if (!isDemoFallbackAllowed()) throw new ApiError("Resume version updates are not available yet", 501);
    return mock.setResumeVersion(applicationId, versionId);
  },
  async listAudits(applicationId: string): Promise<Audit[]> {
    const res = await apiFetch<{ audits: Audit[] }>(`/applications/${applicationId}/audits`);
    if (res.ok) {
      res.data.audits.forEach((audit) =>
        audit.findings.forEach((finding) => findingApplications.set(finding.id, applicationId)),
      );
      return res.data.audits;
    }
    if (!isDemoFallbackAllowed()) return [];
    return mock.listAudits(applicationId);
  },
  async advanceAudit(applicationId: string): Promise<{ targetVersion: number }> {
    const res = await apiFetch<{ targetVersion: number }>(`/applications/${applicationId}/audits/advance`, {
      method: "POST",
      headers: { "idempotency-key": `audit-advance-${applicationId}-${Date.now()}` },
      body: JSON.stringify({}),
    });
    if (res.ok) return res.data;
    throw new ApiError("Could not advance audit", res.status);
  },
  async getWorkflow(applicationId: string): Promise<WorkflowResponse> {
    const res = await apiFetch<WorkflowResponse>(`/applications/${applicationId}/workflow`);
    if (res.ok) return res.data;
    return { workflow: null, events: [] };
  },
  async updateFinding(findingId: string, status: AuditFinding["status"], editedText?: string): Promise<AuditFinding> {
    const appId = findingApplications.get(findingId) ?? audits.find((a) => a.findings.some((f) => f.id === findingId))?.applicationId;
    const decision =
      status === "open" ? undefined : (status as "accepted" | "edited" | "rejected" | "deferred");
    if (appId && decision) {
      const res = await apiFetch<{ finding: AuditFinding }>(
        `/applications/${appId}/audits/findings/${findingId}`,
        { method: "PATCH", body: JSON.stringify({ status: decision, editedText }) },
      );
      if (res.ok) return res.data.finding;
    }
    if (!isDemoFallbackAllowed()) throw new ApiError("Could not update finding", 503);
    return mock.updateFinding(findingId, status, editedText);
  },
  async listMistakeMemory(applicationId: string): Promise<MistakeMemoryRule[]> {
    if (!isDemoFallbackAllowed()) return [];
    return mock.listMistakeMemory(applicationId);
  },
  async overrideMistakeMemory(id: string, override: boolean): Promise<MistakeMemoryRule> {
    if (!isDemoFallbackAllowed()) throw new ApiError("Mistake memory is unavailable", 501);
    return mock.overrideMistakeMemory(id, override);
  },
  async listResearch(applicationId: string): Promise<{
    findings: ResearchFinding[];
    sources: ResearchSource[];
    technologies: TechnologySignal[];
    matrix: EvidenceRoleMatrixRow[];
  }> {
    const res = await apiFetch<{
      findings: ResearchFinding[];
      sources: ResearchSource[];
      confidence: number;
    }>(`/applications/${applicationId}/research`);
    if (res.ok) {
      return {
        findings: (res.data.findings as ResearchFinding[]) ?? [],
        sources: (res.data.sources as ResearchSource[]) ?? [],
        technologies: [],
        matrix: [],
      };
    }
    if (!isDemoFallbackAllowed()) {
      return { findings: [], sources: [], technologies: [], matrix: [] };
    }
    return mock.listResearch(applicationId);
  },
  async getFinalQA(applicationId?: string): Promise<FinalQACheck[]> {
    if (applicationId) {
      const workflow = await this.getWorkflow(applicationId);
      const finalQa = workflow.workflow?.payload?.finalQa as { checks?: Array<Omit<FinalQACheck, "id">> } | undefined;
      if (finalQa?.checks) {
        return finalQa.checks.map((check, index) => ({ id: `server-qa-${index}`, ...check }));
      }
      return [];
    }
    if (!isDemoFallbackAllowed()) return [];
    return mock.getFinalQA();
  },
  async listActivities(applicationId?: string): Promise<ActivityEvent[]> {
    const workflowEvents = applicationId ? (await this.getWorkflow(applicationId)).events : [];
    if (workflowEvents.length) {
      return workflowEvents.map((event) => ({
        id: event.id,
        applicationId: applicationId!,
        type: "workflow",
        title: event.message,
        description: event.stage,
        timestamp: event.createdAt,
      }));
    }
    if (!isDemoFallbackAllowed()) return [];
    return mock.listActivities();
  },
  async listNotifications(): Promise<Notification[]> {
    if (!isDemoFallbackAllowed()) return [];
    return mock.listNotifications();
  },
  async markNotificationRead(id: string): Promise<void> {
    if (!isDemoFallbackAllowed()) return;
    return mock.markNotificationRead(id);
  },
  async getInsights(): Promise<AppInsights> {
    if (!isDemoFallbackAllowed()) return structuredClone(emptyInsights);
    return mock.getInsights();
  },
  subscribeWorkflow(
    applicationId: string,
    onEvent: (event: { seq: number; stage: string; status: string; message: string }) => void,
  ): () => void {
    if (shouldUseMockApi() || typeof EventSource === "undefined") {
      return () => undefined;
    }
    const es = new EventSource(`/api/v1/applications/${applicationId}/workflow/events`, {
      withCredentials: true,
    } as EventSourceInit);
    es.addEventListener("workflow", (msg) => {
      try {
        const data = JSON.parse((msg as MessageEvent).data) as {
          seq: number;
          stage: string;
          status: string;
          message: string;
        };
        onEvent(data);
      } catch {
        /* ignore */
      }
    });
    es.onerror = () => {
      /* browser reconnects */
    };
    return () => es.close();
  },
};
