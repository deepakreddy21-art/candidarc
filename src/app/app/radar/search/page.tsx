"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Filter, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JobCard } from "@/components/radar/job-card";
import { JobDetailPanel } from "@/components/radar/job-detail-panel";
import {
  JobFilters,
  defaultJobFilters,
  type JobFiltersState,
} from "@/components/radar/job-filters";
import { SavedSearchForm } from "@/components/radar/saved-search-form";
import { radarApi } from "@/services/radar-api";
import type { JobSort, RadarJob, RadarSearchParams } from "@/types/radar";
import { cn } from "@/lib/utils";

const SORT_OPTIONS: Array<{ value: JobSort; label: string }> = [
  { value: "best_match", label: "Best match" },
  { value: "genuinely_newest", label: "Genuinely newest" },
  { value: "recently_discovered", label: "Recently discovered" },
  { value: "recently_reposted", label: "Recently reposted" },
  { value: "recently_verified", label: "Recently verified" },
  { value: "company_direct_first", label: "Company-direct first" },
  { value: "highest_compensation", label: "Highest compensation" },
];

function paramsFromUrl(sp: URLSearchParams): {
  q: string;
  location: string;
  sort: JobSort;
  filters: JobFiltersState;
} {
  const filters = defaultJobFilters();
  filters.company = sp.get("company") ?? "";
  filters.remote = (sp.get("remote") as JobFiltersState["remote"]) || "any";
  filters.verifiedOpenOnly = sp.get("verifiedOpenOnly") === "true";
  filters.companyDirectOnly = sp.get("companyDirectOnly") === "true";
  filters.requireKnownOriginalDate = sp.get("requireKnownOriginalDate") === "true";
  filters.hidePossibleDuplicates = sp.get("hidePossibleDuplicates") === "true";
  filters.matchScoreMin = Number(sp.get("matchScoreMin") ?? 0) || 0;
  const excludeDays = sp.get("excludeOriginalOlderThanDays");
  if (excludeDays) filters.excludeOriginalOlderThanDays = Number(excludeDays);
  const maxRepost = sp.get("maxRepostCount");
  if (maxRepost) filters.maxRepostCount = Number(maxRepost);
  filters.freshness = {
    preset: (sp.get("freshnessPreset") as JobFiltersState["freshness"]["preset"]) || "",
    basis: (sp.get("freshnessBasis") as JobFiltersState["freshness"]["basis"]) || "discovered",
    customStart: sp.get("customStart") ?? undefined,
    customEnd: sp.get("customEnd") ?? undefined,
    timezone: sp.get("timezone") ?? undefined,
  };
  filters.freshnessType =
    (sp.get("freshnessType") as JobFiltersState["freshnessType"]) || "any";

  return {
    q: sp.get("q") ?? "",
    location: sp.get("location") ?? "",
    sort: (sp.get("sort") as JobSort) || "best_match",
    filters,
  };
}

function toSearchParams(
  q: string,
  location: string,
  sort: JobSort,
  filters: JobFiltersState,
): RadarSearchParams {
  return {
    q: q || undefined,
    location: location || undefined,
    company: filters.company || undefined,
    remote: filters.remote,
    verifiedOpenOnly: filters.verifiedOpenOnly || undefined,
    companyDirectOnly: filters.companyDirectOnly || undefined,
    requireKnownOriginalDate: filters.requireKnownOriginalDate || undefined,
    hidePossibleDuplicates: filters.hidePossibleDuplicates || undefined,
    matchScoreMin: filters.matchScoreMin || undefined,
    excludeOriginalOlderThanDays: filters.excludeOriginalOlderThanDays,
    maxRepostCount: filters.maxRepostCount,
    freshnessPreset: filters.freshness.preset || undefined,
    freshnessBasis: filters.freshness.basis,
    customStart: filters.freshness.customStart,
    customEnd: filters.freshness.customEnd,
    timezone: filters.freshness.timezone,
    freshnessType: filters.freshnessType,
    sort,
  };
}

function writeUrl(
  router: ReturnType<typeof useRouter>,
  pathname: string,
  q: string,
  location: string,
  sort: JobSort,
  filters: JobFiltersState,
) {
  const params = toSearchParams(q, location, sort, filters);
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "" || value === "any" || value === false)
      continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
}

export default function RadarSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <RadarSearchPageInner />
    </Suspense>
  );
}

function RadarSearchPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = useMemo(() => paramsFromUrl(searchParams), [searchParams]);

  const [q, setQ] = useState(initial.q);
  const [location, setLocation] = useState(initial.location);
  const [sort, setSort] = useState<JobSort>(initial.sort);
  const [filters, setFilters] = useState<JobFiltersState>(initial.filters);
  const [jobs, setJobs] = useState<RadarJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const selected = jobs.find((j) => j.id === selectedId) ?? null;
  const queryPayload = useMemo(
    () => toSearchParams(q, location, sort, filters),
    [q, location, sort, filters],
  );

  const load = useCallback(async (params: RadarSearchParams) => {
    setLoading(true);
    try {
      const result = await radarApi.searchJobs(params);
      setJobs(result.jobs);
      setTotal(result.total);
      setDemoMode(!!result.usingDemoFixtures);
      setSelectedId((prev) => {
        if (prev && result.jobs.some((j) => j.id === prev)) return prev;
        return result.jobs[0]?.id ?? null;
      });
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const parsed = paramsFromUrl(searchParams);
    setQ(parsed.q);
    setLocation(parsed.location);
    setSort(parsed.sort);
    setFilters(parsed.filters);
    void load(toSearchParams(parsed.q, parsed.location, parsed.sort, parsed.filters));
  }, [searchParams, load]);

  function applyFilters(nextFilters: JobFiltersState) {
    setFilters(nextFilters);
    writeUrl(router, pathname, q, location, sort, nextFilters);
  }

  async function toggleSave(job: RadarJob) {
    try {
      if (job.saved) {
        await radarApi.unsaveJob(job.id);
        toast.success("Removed from saved");
      } else {
        await radarApi.saveJob(job.id);
        toast.success("Saved job");
      }
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, saved: !j.saved } : j)),
      );
    } catch {
      toast.error("Could not update saved state");
    }
  }

  async function hideJob(job: RadarJob) {
    try {
      await radarApi.hideJob(job.id);
      setJobs((prev) => prev.filter((j) => j.id !== job.id));
      toast.success("Job hidden");
    } catch {
      toast.error("Could not hide job");
    }
  }

  async function createApplication(job: RadarJob) {
    setCreating(true);
    try {
      const app = await radarApi.createOpportunity(job.id);
      toast.success(`Application workspace created for ${job.company}`);
      router.push(`/app/opportunities/${app.id}`);
    } catch {
      toast.error("Could not create application");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Radar search"
        description="Filter by freshness basis, repost state, company-direct sources, and match quality."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setSaveOpen(true)}>
              Save search
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setFilterOpen(true)}
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
          </div>
        }
      />

      {demoMode ? (
        <p className="text-xs text-foreground-muted">
          Results include demo fixtures. LinkedIn sightings are labeled and are not live access.
        </p>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1.2fr_1fr_auto_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="search-q">Keywords</Label>
          <Input
            id="search-q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") writeUrl(router, pathname, q, location, sort, filters);
            }}
            placeholder="Title, skills, company…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-loc">Location</Label>
          <Input
            id="search-loc"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") writeUrl(router, pathname, q, location, sort, filters);
            }}
            placeholder="City or remote"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search-sort">Sort</Label>
          <select
            id="search-sort"
            value={sort}
            onChange={(e) => {
              const next = e.target.value as JobSort;
              setSort(next);
              writeUrl(router, pathname, q, location, next, filters);
            }}
            className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm sm:min-w-[11rem]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button onClick={() => writeUrl(router, pathname, q, location, sort, filters)}>
            <SlidersHorizontal className="h-4 w-4" />
            Apply
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1.05fr)]">
        <aside className="hidden max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-xl border border-border bg-surface p-4 lg:block">
          <JobFilters value={filters} onChange={applyFilters} />
        </aside>

        <div className="min-w-0 space-y-3">
          <p className="text-sm text-foreground-muted">
            {loading ? "Searching…" : `${total} result${total === 1 ? "" : "s"}`}
          </p>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </div>
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No matching jobs"
              description="Try widening freshness, clearing company-direct, or switching to New or reposted."
            />
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={job.id === selectedId}
                onSelect={setSelectedId}
                onSave={toggleSave}
                onHide={hideJob}
              />
            ))
          )}
        </div>

        <div className={cn("hidden min-w-0 lg:block", !selected && "lg:invisible")}>
          {selected ? (
            <div className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto">
              <JobDetailPanel
                job={selected}
                compact
                creating={creating}
                onSave={() => toggleSave(selected)}
                onHide={() => hideJob(selected)}
                onCreateApplication={() => createApplication(selected)}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* Mobile detail: show below results when selected */}
      {selected ? (
        <div className="lg:hidden">
          <JobDetailPanel
            job={selected}
            compact
            creating={creating}
            onSave={() => toggleSave(selected)}
            onHide={() => hideJob(selected)}
            onCreateApplication={() => createApplication(selected)}
          />
        </div>
      ) : null}

      <Dialog open={filterOpen} onOpenChange={setFilterOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
            <DialogDescription>Freshness, repost state, and match quality</DialogDescription>
          </DialogHeader>
          <JobFilters
            value={filters}
            onChange={(next) => {
              applyFilters(next);
            }}
          />
          <Button className="w-full" onClick={() => setFilterOpen(false)}>
            Show results
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
            <DialogDescription>Bookmark the full filter state for later or alerts.</DialogDescription>
          </DialogHeader>
          <SavedSearchForm
            initialQuery={queryPayload}
            onSubmit={async (input) => {
              await radarApi.saveSearch(input);
              toast.success("Search saved");
              setSaveOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}


