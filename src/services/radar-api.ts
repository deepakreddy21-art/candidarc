import type { Application } from "@/types/domain";
import type {
  JobAlert,
  RadarHistoryEvent,
  RadarHomeSummary,
  RadarJob,
  RadarSearchParams,
  RadarSearchResult,
  SavedSearch,
  SourceCoverageSummary,
} from "@/types/radar";
import {
  filterRadarJobs,
  getMutableRadarState,
  getRadarHomeSummary,
  radarHistoryByJobId,
  radarJobs,
  radarSourceCoverage,
} from "@/data/radar-seed";
import { api, allowDemoFallback, ApiError } from "@/services/api";

// NOTE: Removed artificial delay - no longer needed
const shouldUseMockApi = () => process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

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
      const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
      if (!allowDemoFallback()) throw new ApiError(body?.error?.message ?? `Request failed (${res.status})`, res.status);
      return { ok: false, network: false, status: res.status };
    }
    if (res.status === 204) return { ok: true, data: undefined as T };
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

function toQuery(params: RadarSearchParams): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "any") continue;
    if (typeof value === "boolean") sp.set(key, value ? "true" : "false");
    else sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

/**
 * Map API response to RadarJob.
 * PRODUCTION: Only uses API fields, no seed fallback.
 * DEMO: May fill missing fields from seed for display.
 */
function mapJob(raw: Partial<RadarJob> & { id?: string; publicId?: string }): RadarJob {
  const id = raw.publicId ?? raw.id ?? "";

  // In production, do NOT fall back to seed data
  if (!allowDemoFallback()) {
    return {
      id,
      publicId: id,
      title: raw.title ?? "Unknown",
      company: raw.company ?? "Unknown",
      companyMark: raw.companyMark ?? raw.company?.slice(0, 2).toUpperCase() ?? "??",
      location: raw.location ?? "Unknown",
      remotePolicy: raw.remotePolicy ?? "unspecified",
      employmentType: raw.employmentType ?? "Full-time",
      seniority: raw.seniority,
      department: raw.department,
      compensation: raw.compensation,
      technologies: raw.technologies ?? [],
      classification: raw.classification ?? "UNKNOWN",
      verificationState: raw.verificationState ?? "LIKELY_OPEN",
      companyDirect: raw.companyDirect ?? false,
      timestampEstimated: raw.timestampEstimated ?? false,
      possibleDuplicate: raw.possibleDuplicate ?? false,
      originalPostedAt: raw.originalPostedAt,
      originalPostedPrecision: raw.originalPostedPrecision ?? "UNKNOWN",
      sourcePostedAt: raw.sourcePostedAt,
      repostedAt: raw.repostedAt,
      firstSeenAt: raw.firstSeenAt ?? new Date().toISOString(),
      lastVerifiedAt: raw.lastVerifiedAt,
      repostCount: raw.repostCount ?? 0,
      matchScore: raw.matchScore ?? 0,
      evidenceCoverage: raw.evidenceCoverage ?? 0,
      matchBreakdown: raw.matchBreakdown ?? {
        overall: raw.matchScore ?? 0,
        skills: 0,
        evidence: 0,
        experience: 0,
        seniority: 0,
        location: 0,
        compensation: 0,
        eligibility: 0,
        careerDirection: 0,
      },
      matchLabel: raw.matchLabel,
      matchTone: raw.matchTone,
      matchReasons: raw.matchReasons ?? [],
      primarySource: raw.primarySource ?? {
        id: "unknown",
        name: "Unknown",
        kind: "public_api",
        companyDirect: false,
      },
      sources: raw.sources ?? [],
      sightings: raw.sightings ?? [],
      applicationUrl: raw.applicationUrl,
      companyCareersUrl: raw.companyCareersUrl,
      description: raw.description ?? "",
      responsibilities: raw.responsibilities ?? [],
      requirements: raw.requirements ?? [],
      preferred: raw.preferred ?? [],
      hiringSignals: raw.hiringSignals ?? [],
      freshnessExplanation: raw.freshnessExplanation ?? "Posting freshness unknown",
      repostExplanation: raw.repostExplanation,
      saved: raw.saved,
      hidden: raw.hidden,
      demoData: raw.demoData,
    };
  }

  // Demo mode: fill from seed for display
  const seed = radarJobs.find((j) => j.id === id || j.publicId === id);
  return {
    ...(seed ?? {
      id,
      publicId: id,
      title: "Unknown",
      company: "Unknown",
      companyMark: "??",
      location: "Unknown",
      remotePolicy: "unspecified" as const,
      employmentType: "Full-time",
      technologies: [],
      classification: "UNKNOWN" as const,
      verificationState: "LIKELY_OPEN" as const,
      companyDirect: false,
      timestampEstimated: false,
      possibleDuplicate: false,
      originalPostedPrecision: "UNKNOWN" as const,
      firstSeenAt: new Date().toISOString(),
      repostCount: 0,
      matchScore: 0,
      evidenceCoverage: 0,
      matchBreakdown: {
        overall: 0,
        skills: 0,
        evidence: 0,
        experience: 0,
        seniority: 0,
        location: 0,
        compensation: 0,
        eligibility: 0,
        careerDirection: 0,
      },
      primarySource: { id: "unknown", name: "Unknown", kind: "public_api" as const, companyDirect: false },
      sources: [],
      sightings: [],
      description: "",
      responsibilities: [],
      requirements: [],
      preferred: [],
      hiringSignals: [],
      freshnessExplanation: "Unknown",
    }),
    ...raw,
    id,
    publicId: id,
    technologies: raw.technologies ?? seed?.technologies ?? [],
    sources: raw.sources ?? seed?.sources ?? [],
    sightings: raw.sightings ?? seed?.sightings ?? [],
    responsibilities: raw.responsibilities ?? seed?.responsibilities ?? [],
    requirements: raw.requirements ?? seed?.requirements ?? [],
    preferred: raw.preferred ?? seed?.preferred ?? [],
    hiringSignals: raw.hiringSignals ?? seed?.hiringSignals ?? [],
    matchBreakdown: raw.matchBreakdown ?? seed?.matchBreakdown ?? {
      overall: raw.matchScore ?? 0,
      skills: 0,
      evidence: 0,
      experience: 0,
      seniority: 0,
      location: 0,
      compensation: 0,
      eligibility: 0,
      careerDirection: 0,
    },
    matchLabel: raw.matchLabel,
    matchTone: raw.matchTone,
    matchReasons: raw.matchReasons ?? [],
  };
}

/**
 * Mock API for demo mode.
 * NOTE: Delays removed - they were artificial and unnecessary.
 */
const mock = {
  async searchJobs(params: RadarSearchParams = {}): Promise<RadarSearchResult> {
    const { mutableJobs, hiddenIds, savedIds } = getMutableRadarState();
    const filtered = filterRadarJobs(
      mutableJobs.filter((j) => !hiddenIds.has(j.id)),
      params,
    ).map((j) => ({ ...j, saved: savedIds.has(j.id), hidden: hiddenIds.has(j.id) }));
    const limit = params.limit ?? 50;
    return {
      jobs: filtered.slice(0, limit),
      total: filtered.length,
      usingDemoFixtures: true,
    };
  },
  async getJob(id: string): Promise<RadarJob | undefined> {
    const { mutableJobs, savedIds, hiddenIds } = getMutableRadarState();
    const job = mutableJobs.find((j) => j.id === id || j.publicId === id);
    if (!job) return undefined;
    return { ...job, saved: savedIds.has(job.id), hidden: hiddenIds.has(job.id) };
  },
  async getJobHistory(id: string): Promise<RadarHistoryEvent[]> {
    return structuredClone(radarHistoryByJobId[id] ?? []);
  },
  async saveJob(id: string): Promise<void> {
    getMutableRadarState().savedIds.add(id);
  },
  async unsaveJob(id: string): Promise<void> {
    getMutableRadarState().savedIds.delete(id);
  },
  async hideJob(id: string): Promise<void> {
    const state = getMutableRadarState();
    state.hiddenIds.add(id);
    state.savedIds.delete(id);
  },
  async createApplicationFromJob(id: string): Promise<Application> {
    const job = await mock.getJob(id);
    if (!job) throw new Error("Job not found");
    return api.createApplication({
      company: job.company,
      role: job.title,
      location: job.location,
      employmentType: job.employmentType,
      roleFamily: "AI/ML Engineering",
    });
  },
  async listSavedSearches(): Promise<SavedSearch[]> {
    return structuredClone(getMutableRadarState().mutableSaved);
  },
  async saveSearch(input: { name: string; query: RadarSearchParams }): Promise<SavedSearch> {
    const item: SavedSearch = {
      id: `ss-${Date.now()}`,
      name: input.name,
      query: input.query,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      alertEnabled: false,
    };
    const state = getMutableRadarState();
    state.mutableSaved = [item, ...state.mutableSaved];
    return structuredClone(item);
  },
  async listAlerts(): Promise<JobAlert[]> {
    return structuredClone(getMutableRadarState().mutableAlerts);
  },
  async createAlert(input: Omit<JobAlert, "id" | "createdAt">): Promise<JobAlert> {
    const item: JobAlert = {
      ...input,
      id: `alert-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const state = getMutableRadarState();
    state.mutableAlerts = [item, ...state.mutableAlerts];
    return structuredClone(item);
  },
  async getSourceCoverage(): Promise<SourceCoverageSummary> {
    return structuredClone(radarSourceCoverage);
  },
  async getHomeSummary(): Promise<RadarHomeSummary> {
    return getRadarHomeSummary(getMutableRadarState().mutableJobs);
  },
};

export const radarApi = {
  async searchJobs(params: RadarSearchParams = {}): Promise<RadarSearchResult> {
    const res = await apiFetch<{ jobs: RadarJob[]; total?: number; nextCursor?: string }>(
      `/jobs/search${toQuery(params)}`,
    );
    if (res.ok) {
      return {
        jobs: (res.data.jobs ?? []).map(mapJob),
        total: res.data.total ?? res.data.jobs?.length ?? 0,
        nextCursor: res.data.nextCursor,
        usingDemoFixtures: false,
      };
    }
    return mock.searchJobs(params);
  },

  async getJob(id: string): Promise<RadarJob | undefined> {
    const res = await apiFetch<{ job: RadarJob }>(`/jobs/${id}`);
    if (res.ok) return mapJob(res.data.job);
    return mock.getJob(id);
  },

  async getJobHistory(id: string): Promise<RadarHistoryEvent[]> {
    const res = await apiFetch<{ events: RadarHistoryEvent[]; history?: RadarHistoryEvent[] }>(
      `/jobs/${id}/history`,
    );
    if (res.ok) return res.data.events ?? res.data.history ?? [];
    return mock.getJobHistory(id);
  },

  async saveJob(id: string): Promise<void> {
    const res = await apiFetch(`/jobs/${id}/save`, { method: "POST", body: "{}" });
    if (res.ok) return;
    return mock.saveJob(id);
  },

  async unsaveJob(id: string): Promise<void> {
    const res = await apiFetch(`/jobs/${id}/save`, { method: "DELETE" });
    if (res.ok) return;
    return mock.unsaveJob(id);
  },

  async hideJob(id: string): Promise<void> {
    const res = await apiFetch(`/jobs/${id}/hide`, { method: "POST", body: "{}" });
    if (res.ok) return;
    return mock.hideJob(id);
  },

  async createApplicationFromJob(id: string): Promise<Application> {
    const res = await apiFetch<{ application: Application }>(`/jobs/${id}/create-application`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (res.ok) return res.data.application;
    return mock.createApplicationFromJob(id);
  },

  /** Opportunity-oriented alias; the compatibility endpoint still creates the workspace. */
  async createOpportunity(id: string): Promise<Application> {
    return this.createApplicationFromJob(id);
  },

  async listSavedSearches(): Promise<SavedSearch[]> {
    const res = await apiFetch<{ savedSearches: SavedSearch[] }>("/saved-searches");
    if (res.ok) return res.data.savedSearches;
    return mock.listSavedSearches();
  },

  async saveSearch(input: { name: string; query: RadarSearchParams }): Promise<SavedSearch> {
    const res = await apiFetch<{ savedSearch: SavedSearch }>("/saved-searches", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (res.ok) return res.data.savedSearch;
    return mock.saveSearch(input);
  },

  async listAlerts(): Promise<JobAlert[]> {
    const res = await apiFetch<{ alerts: JobAlert[] }>("/job-alerts");
    if (res.ok) return res.data.alerts;
    return mock.listAlerts();
  },

  async createAlert(input: Omit<JobAlert, "id" | "createdAt">): Promise<JobAlert> {
    const res = await apiFetch<{ alert: JobAlert }>("/job-alerts", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (res.ok) return res.data.alert;
    return mock.createAlert(input);
  },

  async getSourceCoverage(): Promise<SourceCoverageSummary> {
    const res = await apiFetch<SourceCoverageSummary>("/job-sources/coverage");
    if (res.ok) return res.data;
    return mock.getSourceCoverage();
  },

  async getHomeSummary(): Promise<RadarHomeSummary> {
    // Prefer deriving from search when API is available
    const search = await this.searchJobs({ matchScoreMin: 75, limit: 50 });
    if (!search.usingDemoFixtures) {
      return getRadarHomeSummary(search.jobs);
    }
    return mock.getHomeSummary();
  },

  /**
   * Tailor a resume for a specific job.
   * Returns workflowId for navigation to /app/resumes/{workflowId}.
   */
  async tailorResume(jobId: string): Promise<{ workflowId: string; applicationId: string }> {
    const res = await apiFetch<{ workflowId: string; applicationId: string }>(
      `/jobs/${jobId}/tailor-resume`,
      { method: "POST", body: "{}" },
    );
    if (res.ok) return res.data;
    throw new ApiError("Could not tailor resume for this job", res.status ?? 500);
  },

  /**
   * Parse natural language search query into structured filters.
   */
  async parseSearch(query: string): Promise<{
    query: RadarSearchParams;
    parsedFilters: Record<string, string>;
    confidence: number;
  }> {
    const res = await apiFetch<{
      query: RadarSearchParams;
      parsedFilters: Record<string, string>;
      confidence: number;
    }>("/jobs/parse-search", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    if (res.ok) return res.data;
    // Fall back to keyword-only
    return { query: { q: query }, parsedFilters: {}, confidence: 0.1 };
  },

  /**
   * Get opportunity brief for a job.
   */
  async getBrief(jobId: string): Promise<{
    summary: string;
    companyOverview?: string;
    roleHighlights: string[];
    skillsAlignment: string[];
    concerns: string[];
    resumeReadinessLabel: "ready" | "needs_work" | "significant_gaps";
    cached: boolean;
  }> {
    const res = await apiFetch<{
      summary: string;
      companyOverview?: string;
      roleHighlights: string[];
      skillsAlignment: string[];
      concerns: string[];
      resumeReadinessLabel: "ready" | "needs_work" | "significant_gaps";
      cached: boolean;
    }>(`/jobs/${jobId}/brief`);
    if (res.ok) return res.data;
    throw new ApiError("Could not load opportunity brief", res.status ?? 500);
  },

  /**
   * Record a user interaction with a job.
   */
  async recordInteraction(
    jobId: string,
    interactionType: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await apiFetch(`/jobs/${jobId}/interactions`, {
      method: "POST",
      body: JSON.stringify({ interactionType, metadata }),
    });
  },
};
