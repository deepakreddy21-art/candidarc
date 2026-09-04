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
  TechnologySignal,
  ActivityEvent,
  AppInsights,
} from "@/types/domain";
import {
  activities,
  applications as seedApplications,
  audits as seedAudits,
  candidate as seedCandidate,
  evidenceItems as seedEvidence,
  evidenceRoleMatrix,
  finalQAChecks,
  insights,
  jobDescriptions,
  mistakeMemory as seedMemory,
  notifications as seedNotifications,
  researchFindings,
  researchSources,
  resumes as seedResumes,
  technologySignals,
} from "@/data/seed";

const delay = (ms = 180) => new Promise((r) => setTimeout(r, ms));

let applications = structuredClone(seedApplications);
let evidence = structuredClone(seedEvidence);
let audits = structuredClone(seedAudits);
let resumes = structuredClone(seedResumes);
let memory = structuredClone(seedMemory);
let notifications = structuredClone(seedNotifications);
let profile = structuredClone(seedCandidate);

const shouldUseMockApi = () => process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export const allowDemoFallback = () =>
  process.env.NEXT_PUBLIC_APP_MODE === "demo" ||
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; network: boolean; status?: number };

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
      if (!allowDemoFallback()) throw new ApiError(body?.error?.message ?? body?.message ?? `Request failed (${res.status})`, res.status);
      return { ok: false, network: false, status: res.status };
    }
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch (error) {
    if (!allowDemoFallback()) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error instanceof Error ? error.message : "Network request failed");
    }
    return { ok: false, network: true };
  }
}

const mock = {
  async getProfile(): Promise<CandidateProfile> {
    await delay();
    return structuredClone(profile);
  },
  async updateProfile(patch: Partial<CandidateProfile>): Promise<CandidateProfile> {
    await delay();
    profile = { ...profile, ...patch };
    return structuredClone(profile);
  },
  async listApplications(includeArchived = false): Promise<Application[]> {
    await delay();
    return structuredClone(applications.filter((a) => includeArchived || !a.archived));
  },
  async getApplication(id: string): Promise<Application | undefined> {
    await delay();
    return structuredClone(applications.find((a) => a.id === id));
  },
  async createApplication(input: Partial<Application> & Pick<Application, "company" | "role">): Promise<Application> {
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
    await delay();
    applications = applications.map((a) => (ids.includes(a.id) ? { ...a, archived: true, status: "archived" } : a));
  },
  async getJobDescription(id: string): Promise<JobDescription | undefined> {
    await delay();
    return structuredClone(jobDescriptions.find((j) => j.id === id));
  },
  async listEvidence(): Promise<EvidenceItem[]> {
    await delay();
    return structuredClone(evidence);
  },
  async getEvidence(id: string): Promise<EvidenceItem | undefined> {
    await delay();
    return structuredClone(evidence.find((e) => e.id === id));
  },
  async upsertEvidence(item: EvidenceItem): Promise<EvidenceItem> {
    await delay();
    const idx = evidence.findIndex((e) => e.id === item.id);
    if (idx >= 0) evidence[idx] = item;
    else evidence = [item, ...evidence];
    return structuredClone(item);
  },
  async getResume(applicationId: string): Promise<Resume | undefined> {
    await delay();
    return structuredClone(resumes.find((r) => r.applicationId === applicationId) ?? resumes[0]);
  },
  async setResumeVersion(applicationId: string, versionId: string): Promise<Resume> {
    await delay();
    resumes = resumes.map((r) =>
      r.applicationId === applicationId ? { ...r, currentVersionId: versionId } : r,
    );
    const resume = resumes.find((r) => r.applicationId === applicationId) ?? resumes[0];
    return structuredClone(resume);
  },
  async listAudits(applicationId: string): Promise<Audit[]> {
    await delay();
    return structuredClone(audits.filter((a) => a.applicationId === applicationId));
  },
  async updateFinding(findingId: string, status: AuditFinding["status"], editedText?: string): Promise<AuditFinding> {
    await delay();
    let updated!: AuditFinding;
    audits = audits.map((audit) => ({
      ...audit,
      findings: audit.findings.map((f) => {
        if (f.id !== findingId) return f;
        updated = {
          ...f,
          status,
          suggestedText: editedText ?? f.suggestedText,
        };
        return updated;
      }),
    }));
    return structuredClone(updated);
  },
  async listMistakeMemory(applicationId: string): Promise<MistakeMemoryRule[]> {
    await delay();
    return structuredClone(memory.filter((m) => m.applicationId === applicationId));
  },
  async overrideMistakeMemory(id: string, override: boolean): Promise<MistakeMemoryRule> {
    await delay();
    memory = memory.map((m) => (m.id === id ? { ...m, userOverride: override, status: override ? "overridden" : "active" } : m));
    return structuredClone(memory.find((m) => m.id === id)!);
  },
  async listResearch(applicationId: string): Promise<{
    findings: ResearchFinding[];
    sources: ResearchSource[];
    technologies: TechnologySignal[];
    matrix: EvidenceRoleMatrixRow[];
  }> {
    await delay();
    return {
      findings: structuredClone(researchFindings.filter((f) => f.applicationId === applicationId)),
      sources: structuredClone(researchSources),
      technologies: structuredClone(technologySignals),
      matrix: structuredClone(evidenceRoleMatrix),
    };
  },
  async getFinalQA(): Promise<FinalQACheck[]> {
    await delay();
    return structuredClone(finalQAChecks);
  },
  async listActivities(): Promise<ActivityEvent[]> {
    await delay();
    return structuredClone(activities);
  },
  async listNotifications(): Promise<Notification[]> {
    await delay();
    return structuredClone(notifications);
  },
  async markNotificationRead(id: string): Promise<void> {
    await delay(80);
    notifications = notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
  },
  async getInsights(): Promise<AppInsights> {
    await delay();
    return structuredClone(insights);
  },
};

export const api = {
  async getProfile(): Promise<CandidateProfile> {
    return mock.getProfile();
  },
  async updateProfile(patch: Partial<CandidateProfile>): Promise<CandidateProfile> {
    return mock.updateProfile(patch);
  },
  async listApplications(includeArchived = false): Promise<Application[]> {
    const q = includeArchived ? "?includeArchived=true" : "";
    const res = await apiFetch<{ applications: Application[] }>(`/applications${q}`);
    if (res.ok) return res.data.applications;
    return mock.listApplications(includeArchived);
  },
  async getApplication(id: string): Promise<Application | undefined> {
    const res = await apiFetch<{ application: Application }>(`/applications/${id}`);
    if (res.ok) return res.data.application;
    return mock.getApplication(id);
  },
  async createApplication(input: Partial<Application> & Pick<Application, "company" | "role">): Promise<Application> {
    const res = await apiFetch<{ application: Application }>("/applications", {
      method: "POST",
      body: JSON.stringify({
        company: input.company,
        role: input.role,
        location: input.location,
        employmentType: input.employmentType,
        deadline: input.deadline,
        roleFamily: input.roleFamily,
        jobUrl: undefined,
        jobDescriptionText: undefined,
        researchDepth: "standard",
      }),
    });
    if (res.ok) return res.data.application;
    return mock.createApplication(input);
  },
  async archiveApplications(ids: string[]): Promise<void> {
    let usedApi = false;
    for (const id of ids) {
      const res = await apiFetch(`/applications/${id}`, { method: "DELETE" });
      if (res.ok) usedApi = true;
    }
    if (!usedApi) await mock.archiveApplications(ids);
  },
  async getJobDescription(id: string): Promise<JobDescription | undefined> {
    return mock.getJobDescription(id);
  },
  async listEvidence(): Promise<EvidenceItem[]> {
    const res = await apiFetch<{ evidence: EvidenceItem[] }>("/evidence");
    if (res.ok) return res.data.evidence;
    return mock.listEvidence();
  },
  async getEvidence(id: string): Promise<EvidenceItem | undefined> {
    const res = await apiFetch<{ evidence: EvidenceItem }>(`/evidence/${id}`);
    if (res.ok) return res.data.evidence;
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
    return mock.upsertEvidence(item);
  },
  async getResume(applicationId: string): Promise<Resume | undefined> {
    const res = await apiFetch<{ resume: Resume | null }>(`/applications/${applicationId}/resume`);
    if (res.ok) return res.data.resume ?? undefined;
    return mock.getResume(applicationId);
  },
  async setResumeVersion(applicationId: string, versionId: string): Promise<Resume> {
    // No dedicated API yet — keep local mock behavior for studio UX
    return mock.setResumeVersion(applicationId, versionId);
  },
  async listAudits(applicationId: string): Promise<Audit[]> {
    const res = await apiFetch<{ audits: Audit[] }>(`/applications/${applicationId}/audits`);
    if (res.ok) return res.data.audits;
    return mock.listAudits(applicationId);
  },
  async updateFinding(findingId: string, status: AuditFinding["status"], editedText?: string): Promise<AuditFinding> {
    // Finding decisions are scoped under an application; try cisco first then fall back
    const appId =
      audits.find((a) => a.findings.some((f) => f.id === findingId))?.applicationId ?? "app-cisco";
    const decision =
      status === "open"
        ? undefined
        : (status as "accepted" | "edited" | "rejected" | "deferred");
    if (decision) {
      const res = await apiFetch<{ finding: AuditFinding }>(
        `/applications/${appId}/audits/findings/${findingId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: decision, editedText }),
        },
      );
      if (res.ok) return res.data.finding;
    }
    return mock.updateFinding(findingId, status, editedText);
  },
  async listMistakeMemory(applicationId: string): Promise<MistakeMemoryRule[]> {
    return mock.listMistakeMemory(applicationId);
  },
  async overrideMistakeMemory(id: string, override: boolean): Promise<MistakeMemoryRule> {
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
        technologies: structuredClone(technologySignals),
        matrix: structuredClone(evidenceRoleMatrix),
      };
    }
    return mock.listResearch(applicationId);
  },
  async getFinalQA(): Promise<FinalQACheck[]> {
    return mock.getFinalQA();
  },
  async listActivities(): Promise<ActivityEvent[]> {
    return mock.listActivities();
  },
  async listNotifications(): Promise<Notification[]> {
    return mock.listNotifications();
  },
  async markNotificationRead(id: string): Promise<void> {
    return mock.markNotificationRead(id);
  },
  async getInsights(): Promise<AppInsights> {
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
      /* keep open; browser reconnects */
    };
    return () => es.close();
  },
};
