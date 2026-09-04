import type {
  JobAlert,
  RadarHistoryEvent,
  RadarHomeSummary,
  RadarJob,
  RadarSearchParams,
  SavedSearch,
  SourceCoverageSummary,
} from "@/types/radar";

export const radarJobs: RadarJob[] = [];
export const radarHistoryByJobId: Record<string, RadarHistoryEvent[]> = {};
export const radarSavedSearches: SavedSearch[] = [];
export const radarAlerts: JobAlert[] = [];
export const radarSourceCoverage: SourceCoverageSummary = {
  items: [],
  summary: "No demo Radar fixtures in production builds.",
};

export function getRadarHomeSummary(jobs: RadarJob[] = radarJobs): RadarHomeSummary {
  void jobs;
  return {
    strongMatches: 0,
    genuinelyNew: 0,
    reposted: 0,
    uncertainDates: 0,
    windowLabel: "production",
  };
}

export function filterRadarJobs(jobs: RadarJob[], params: RadarSearchParams): RadarJob[] {
  void params;
  return jobs;
}

const hiddenIds = new Set<string>();
const savedIds = new Set<string>();

export function getMutableRadarState() {
  return {
    mutableJobs: [] as RadarJob[],
    mutableSaved: [] as SavedSearch[],
    mutableAlerts: [] as JobAlert[],
    hiddenIds,
    savedIds,
  };
}

export function resetRadarSeedState() {
  hiddenIds.clear();
  savedIds.clear();
}
