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
import { api } from "@/services/api";

const delay = (ms = 160) => new Promise((r) => setTimeout(r, ms));

const shouldUseMockApi = () => process.env.NEXT_PUBLIC_USE_MOCK_API === "true";

const allowDemoFallback = () =>
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.NEXT_PUBLIC_USE_MOCK_API === "true" ||
  process.env.NODE_ENV !== "production";

let sessionReady: Promise<boolean> | null = null;

async function ensureSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!sessionReady) {
    sessionReady = (async () => {
      try {
        const me = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (me.ok) return true;
        const login = await fetch("/api/v1/auth/login", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "deepak@candidarc.dev",
            password: "CandidArc!Demo1",
          }),
        });
        return login.ok;
      } catch {
        return false;
      }
    })();
  }
  return sessionReady;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; network: boolean; status?: number };

async function apiFetch<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  if (shouldUseMockApi()) return { ok: false, network: false };
  try {
    await ensureSession();
    const res = await fetch(`/api/v1${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      if (!allowDemoFallback() && res.status >= 500) {
        return { ok: false, network: false, status: res.status };
      }
      return { ok: false, network: false, status: res.status };
    }
    if (res.status === 204) return { ok: true, data: undefined as T };
    const data = (await res.json()) as T;
    return { ok: true, data };
  } catch {
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

function mapJob(raw: Partial<RadarJob> & { id?: string; publicId?: string }): RadarJob {
  const id = raw.publicId ?? raw.id ?? "";
  const seed = radarJobs.find((j) => j.id === id || j.publicId === id);
  return {
    ...(seed ?? radarJobs[0]),
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
  };
}

const mock = {
  async searchJobs(params: RadarSearchParams = {}): Promise<RadarSearchResult> {
    await delay();
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
    await delay();
    const { mutableJobs, savedIds, hiddenIds } = getMutableRadarState();
    const job = mutableJobs.find((j) => j.id === id || j.publicId === id);
    if (!job) return undefined;
    return { ...job, saved: savedIds.has(job.id), hidden: hiddenIds.has(job.id) };
  },
  async getJobHistory(id: string): Promise<RadarHistoryEvent[]> {
    await delay();
    return structuredClone(radarHistoryByJobId[id] ?? []);
  },
  async saveJob(id: string): Promise<void> {
    await delay(80);
    getMutableRadarState().savedIds.add(id);
  },
  async unsaveJob(id: string): Promise<void> {
    await delay(80);
    getMutableRadarState().savedIds.delete(id);
  },
  async hideJob(id: string): Promise<void> {
    await delay(80);
    const state = getMutableRadarState();
    state.hiddenIds.add(id);
    state.savedIds.delete(id);
  },
  async createApplicationFromJob(id: string): Promise<Application> {
    await delay(320);
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
    await delay();
    return structuredClone(getMutableRadarState().mutableSaved);
  },
  async saveSearch(input: { name: string; query: RadarSearchParams }): Promise<SavedSearch> {
    await delay(200);
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
    await delay();
    return structuredClone(getMutableRadarState().mutableAlerts);
  },
  async createAlert(input: Omit<JobAlert, "id" | "createdAt">): Promise<JobAlert> {
    await delay(200);
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
    await delay();
    return structuredClone(radarSourceCoverage);
  },
  async getHomeSummary(): Promise<RadarHomeSummary> {
    await delay();
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
};
