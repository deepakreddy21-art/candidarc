"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { JobCard } from "@/components/radar/job-card";
import { JobDetailPanel } from "@/components/radar/job-detail-panel";
import { SavedSearchForm } from "@/components/radar/saved-search-form";
import { AlertForm } from "@/components/radar/alert-form";
import { radarApi } from "@/services/radar-api";
import { api, isCancelledError } from "@/services/api";
import type {
  FreshnessBasis,
  FreshnessPreset,
  RadarJob,
  RadarSearchParams,
  RemotePolicy,
} from "@/types/radar";
import { cn } from "@/lib/utils";

type FeedTab = "best" | "newest" | "saved";

function paramsFromUrl(sp: URLSearchParams): RadarSearchParams & { tab: FeedTab; arrangement: RemotePolicy | "any" } {
  const rawTab = sp.get("tab");
  const tab: FeedTab = rawTab === "newest" || rawTab === "saved" || rawTab === "best" ? rawTab : "best";
  return {
    q: sp.get("q") ?? "",
    location: sp.get("location") ?? "",
    arrangement: (sp.get("arrangement") as RemotePolicy | "any") || "any",
    remotePolicy: (sp.get("arrangement") as RemotePolicy) || undefined,
    freshnessPreset: (sp.get("freshnessPreset") as FreshnessPreset) || "7d",
    freshnessBasis: (sp.get("freshnessBasis") as FreshnessBasis) || "discovered",
    freshnessType: sp.get("genuinelyNew") === "1" ? "genuinely_new" : undefined,
    verifiedOpenOnly: sp.get("verifiedOpen") === "1",
    companyDirectOnly: sp.get("companyDirect") === "1",
    company: sp.get("company") ?? undefined,
    employmentType: sp.get("employmentType") ?? undefined,
    seniority: sp.get("seniority") ?? undefined,
    sponsorship: (sp.get("sponsorship") as RadarSearchParams["sponsorship"]) || undefined,
    compensationMin: sp.get("compensationMin") ? Number(sp.get("compensationMin")) : undefined,
    includeReposts: sp.get("includeReposts") !== "0",
    hidePossibleDuplicates: sp.get("hideDuplicates") === "1",
    requireKnownOriginalDate: sp.get("requireOriginal") === "1",
    customStart: sp.get("customStart") ?? undefined,
    customEnd: sp.get("customEnd") ?? undefined,
    timezone: sp.get("timezone") ?? undefined,
    excludedCompanies: sp.get("excludedCompanies") ?? undefined,
    savedOnly: tab === "saved",
    tab,
    limit: 20,
    sort: tab === "newest" ? "recently_discovered" : "best_match",
  };
}

export function RadarFeed() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => paramsFromUrl(searchParams), [searchParams]);

  const [q, setQ] = useState(filters.q ?? "");
  const [location, setLocation] = useState(filters.location ?? "");
  const [arrangement, setArrangement] = useState<RemotePolicy | "any">(filters.arrangement);
  const [jobs, setJobs] = useState<RadarJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [pendingJobId, setPendingJobId] = useState<string | undefined>();
  const [pendingKind, setPendingKind] = useState<"save" | "hide" | "tailor" | "unhide" | undefined>();
  const [tailoringId, setTailoringId] = useState<string | undefined>();
  const tailoringRef = useRef(false);
  const actionRef = useRef(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveSearchOpen, setSaveSearchOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [savingSearch, setSavingSearch] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false);
  const [prefSummary, setPrefSummary] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const listRequestId = useRef(0);
  const [advanced, setAdvanced] = useState({
    company: filters.company ?? "",
    employmentType: filters.employmentType ?? "",
    seniority: filters.seniority ?? "",
    sponsorship: filters.sponsorship ?? "",
    compensationMin: filters.compensationMin?.toString() ?? "",
    freshnessBasis: filters.freshnessBasis ?? ("discovered" as FreshnessBasis),
    includeReposts: filters.includeReposts !== false,
    hideDuplicates: Boolean(filters.hidePossibleDuplicates),
    requireOriginal: Boolean(filters.requireKnownOriginalDate),
    excludedCompanies: filters.excludedCompanies ?? "",
    verifiedOpen: Boolean(filters.verifiedOpenOnly),
    companyDirect: Boolean(filters.companyDirectOnly),
    freshnessPreset: filters.freshnessPreset ?? ("7d" as FreshnessPreset),
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    void api
      .getProfile()
      .then((profile) => {
        const roles = profile.targetRoleFamilies?.slice(0, 2).join(", ");
        const locs = profile.preferredLocations?.slice(0, 2).join(", ") || profile.location;
        const bits = [roles, locs].filter(Boolean);
        setPrefSummary(bits.length ? bits.join(" · ") : null);
      })
      .catch(() => setPrefSummary(null));
  }, []);

  const writeUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = ++listRequestId.current;
    const hasRows = jobsRef.current.length > 0;
    if (hasRows) setRefreshing(true);
    else setLoading(true);
    setError(undefined);
    try {
      const result = await radarApi.searchJobs(
        {
          q: filters.q,
          location: filters.location,
          remotePolicy: filters.arrangement === "any" ? undefined : filters.arrangement,
          freshnessPreset: filters.freshnessPreset,
          freshnessBasis: filters.freshnessBasis,
          freshnessType: filters.freshnessType,
          verifiedOpenOnly: filters.verifiedOpenOnly,
          companyDirectOnly: filters.companyDirectOnly,
          company: filters.company,
          employmentType: filters.employmentType,
          seniority: filters.seniority,
          sponsorship: filters.sponsorship,
          compensationMin: filters.compensationMin,
          includeReposts: filters.includeReposts,
          hidePossibleDuplicates: filters.hidePossibleDuplicates,
          requireKnownOriginalDate: filters.requireKnownOriginalDate,
          customStart: filters.customStart,
          customEnd: filters.customEnd,
          timezone: filters.timezone,
          excludedCompanies: filters.excludedCompanies,
          savedOnly: filters.tab === "saved",
          sort: filters.sort,
          limit: 20,
          cursor: undefined,
        },
        { signal },
      );
      if (signal?.aborted || requestId !== listRequestId.current) return;
      setJobs(result.jobs);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
      setLastUpdated(new Date().toISOString());
      setSelectedId((current) =>
        current && result.jobs.some((job) => job.id === current) ? current : result.jobs[0]?.id,
      );
    } catch (err) {
      if (isCancelledError(err) || signal?.aborted || requestId !== listRequestId.current) return;
      setError(err instanceof Error ? err.message : "Could not load jobs");
      if (!hasRows) {
        setJobs([]);
        setTotal(0);
      }
    } finally {
      if (!signal?.aborted && requestId === listRequestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    setQ(filters.q ?? "");
    setLocation(filters.location ?? "");
    setArrangement(filters.arrangement);
  }, [filters.arrangement, filters.location, filters.q]);

  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  async function runSearch(extra?: Record<string, string | undefined>) {
    let nextQ = q.trim();
    if (nextQ.split(/\s+/).length >= 6 || /posted|requiring|remote|last /i.test(nextQ)) {
      try {
        const parsed = await radarApi.parseSearch(nextQ);
        if (parsed.query.location && !location) setLocation(parsed.query.location);
        if (parsed.query.remote && parsed.query.remote !== "any") setArrangement(parsed.query.remote);
        if (parsed.query.q) nextQ = parsed.query.q;
      } catch {
        // Keep ordinary keyword search when NL parsing fails.
      }
    }
    writeUrl({
      q: nextQ || undefined,
      location: location.trim() || undefined,
      arrangement: arrangement === "any" ? undefined : arrangement,
      ...extra,
    });
  }

  async function tailor(job: RadarJob) {
    if (tailoringRef.current) return;
    tailoringRef.current = true;
    setTailoringId(job.id);
    setPendingJobId(job.id);
    setPendingKind("tailor");
    try {
      const result = await radarApi.tailorResume(job.id);
      router.push(`/app/resumes/${result.workflowId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start resume generation");
      tailoringRef.current = false;
      setTailoringId(undefined);
      setPendingJobId(undefined);
      setPendingKind(undefined);
    }
  }

  async function hide(job: RadarJob) {
    if (actionRef.current) return;
    actionRef.current = true;
    const snapshot = jobsRef.current;
    setPendingJobId(job.id);
    setPendingKind("hide");
    setJobs((current) => current.filter((item) => item.id !== job.id));
    if (selectedId === job.id) {
      setSelectedId(snapshot.find((item) => item.id !== job.id)?.id);
    }
    try {
      await radarApi.hideJob(job.id);
      toast.message("Job hidden from this feed", {
        action: {
          label: "Undo hide",
          onClick: () => {
            void (async () => {
              setPendingJobId(job.id);
              setPendingKind("unhide");
              try {
                await radarApi.unhideJob(job.id);
                setJobs((current) => {
                  if (current.some((item) => item.id === job.id)) return current;
                  return [job, ...current];
                });
                setSelectedId(job.id);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not restore job");
              } finally {
                setPendingJobId(undefined);
                setPendingKind(undefined);
              }
            })();
          },
        },
      });
    } catch (err) {
      setJobs(snapshot);
      setSelectedId(job.id);
      toast.error(err instanceof Error ? err.message : "Could not hide job");
    } finally {
      actionRef.current = false;
      setPendingJobId(undefined);
      setPendingKind(undefined);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await radarApi.searchJobs({
        q: filters.q,
        location: filters.location,
        remotePolicy: filters.arrangement === "any" ? undefined : filters.arrangement,
        freshnessPreset: filters.freshnessPreset,
        freshnessBasis: filters.freshnessBasis,
        freshnessType: filters.freshnessType,
        verifiedOpenOnly: filters.verifiedOpenOnly,
        companyDirectOnly: filters.companyDirectOnly,
        company: filters.company,
        employmentType: filters.employmentType,
        seniority: filters.seniority,
        sponsorship: filters.sponsorship,
        compensationMin: filters.compensationMin,
        includeReposts: filters.includeReposts,
        hidePossibleDuplicates: filters.hidePossibleDuplicates,
        requireKnownOriginalDate: filters.requireKnownOriginalDate,
        excludedCompanies: filters.excludedCompanies,
        savedOnly: filters.tab === "saved",
        sort: filters.sort,
        limit: 20,
        cursor: nextCursor,
      });
      setJobs((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...result.jobs.filter((job) => !seen.has(job.id))];
      });
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load more jobs");
    } finally {
      setLoadingMore(false);
    }
  }

  async function save(job: RadarJob) {
    if (actionRef.current) return;
    actionRef.current = true;
    // Invalidate in-flight list fetches before mutating so stale savedOnly pages cannot resurrect rows.
    listRequestId.current += 1;
    const previous = job.saved;
    setPendingJobId(job.id);
    setPendingKind("save");
    setJobs((current) => {
      if (filters.tab === "saved" && job.saved) {
        return current.filter((item) => item.id !== job.id);
      }
      return current.map((item) => (item.id === job.id ? { ...item, saved: !item.saved } : item));
    });
    try {
      if (job.saved) await radarApi.unsaveJob(job.id);
      else await radarApi.saveJob(job.id);
    } catch (err) {
      setJobs((current) => {
        if (filters.tab === "saved" && previous) {
          return current.some((item) => item.id === job.id)
            ? current.map((item) => (item.id === job.id ? { ...item, saved: previous } : item))
            : [...current, { ...job, saved: previous }];
        }
        return current.map((item) => (item.id === job.id ? { ...item, saved: previous } : item));
      });
      toast.error(err instanceof Error ? err.message : "Could not update saved job");
    } finally {
      actionRef.current = false;
      setPendingJobId(undefined);
      setPendingKind(undefined);
    }
  }

  function resetFilters() {
    setQ("");
    setLocation("");
    setArrangement("any");
    setAdvanced({
      company: "",
      employmentType: "",
      seniority: "",
      sponsorship: "",
      compensationMin: "",
      freshnessBasis: "discovered",
      includeReposts: true,
      hideDuplicates: false,
      requireOriginal: false,
      excludedCompanies: "",
      verifiedOpen: false,
      companyDirect: false,
      freshnessPreset: "7d",
    });
    writeUrl({
      q: undefined,
      location: undefined,
      sponsorship: undefined,
      company: undefined,
      seniority: undefined,
      arrangement: undefined,
      employmentType: undefined,
      compensationMin: undefined,
      verifiedOpen: undefined,
      companyDirect: undefined,
      hideDuplicates: undefined,
      includeReposts: undefined,
      freshnessPreset: undefined,
      freshnessBasis: undefined,
      excludedCompanies: undefined,
      requireOriginal: undefined,
      genuinelyNew: undefined,
      customStart: undefined,
      customEnd: undefined,
      timezone: undefined,
    });
  }

  const hasFilters = [...searchParams.keys()].some((key) => key !== "tab" && key !== "job");

  function selectJob(id: string) {
    if (isNarrow) {
      router.push(`/app/radar/jobs/${id}`);
      return;
    }
    setSelectedId(id);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jobs for you"
        description="Roles matched to your profile — open one to see fit, team signals, and how we’d tailor your resume."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/resumes/new" className={buttonVariants({ size: "sm" })}>
              Tailor a job I found
            </Link>
            <Link href="/app/settings/job-preferences" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Preferences
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-foreground-muted">
        {prefSummary ? <span>{prefSummary}</span> : <span>Set target roles and locations in preferences</span>}
        {lastUpdated ? (
          <span className="text-xs">Updated {new Date(lastUpdated).toLocaleTimeString()}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <Input
            id="jobs-search"
            aria-label="Search jobs"
            className="pl-9"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by title, company, or skill"
            onKeyDown={(event) => {
              if (event.key === "Enter") void runSearch();
            }}
          />
        </div>
        <Input
          aria-label="Location shortcut"
          className="sm:max-w-[11rem]"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="Location"
          onKeyDown={(event) => {
            if (event.key === "Enter") void runSearch();
          }}
        />
        <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" aria-haspopup="dialog">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Filters</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Work arrangement" htmlFor="filter-arrangement">
                <select
                  id="filter-arrangement"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={arrangement}
                  onChange={(e) => setArrangement(e.target.value as RemotePolicy | "any")}
                >
                  <option value="any">Any</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </Field>
              <Field label="Date posted" htmlFor="filter-freshness">
                <select
                  id="filter-freshness"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={advanced.freshnessPreset}
                  onChange={(e) =>
                    setAdvanced({ ...advanced, freshnessPreset: e.target.value as FreshnessPreset })
                  }
                >
                  <option value="1h">Last 1 hour</option>
                  <option value="3h">Last 3 hours</option>
                  <option value="24h">Last 24 hours</option>
                  <option value="7d">Last 7 days</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="Company" htmlFor="filter-company">
                <Input
                  id="filter-company"
                  value={advanced.company}
                  onChange={(e) => setAdvanced({ ...advanced, company: e.target.value })}
                />
              </Field>
              <Field label="Job type" htmlFor="filter-job-type">
                <Input
                  id="filter-job-type"
                  value={advanced.employmentType}
                  onChange={(e) => setAdvanced({ ...advanced, employmentType: e.target.value })}
                  placeholder="Full-time, contract…"
                />
              </Field>
              <Field label="Seniority" htmlFor="filter-seniority">
                <Input
                  id="filter-seniority"
                  value={advanced.seniority}
                  onChange={(e) => setAdvanced({ ...advanced, seniority: e.target.value })}
                />
              </Field>
              <Field label="Sponsorship in this posting" htmlFor="filter-sponsorship">
                <select
                  id="filter-sponsorship"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={advanced.sponsorship}
                  onChange={(e) => setAdvanced({ ...advanced, sponsorship: e.target.value })}
                >
                  <option value="">Any / not filtered</option>
                  <option value="stated">Stated in this posting</option>
                  <option value="historical">Company historical evidence</option>
                  <option value="not_offered">Not offered</option>
                  <option value="unknown">Unknown</option>
                </select>
              </Field>
              <Field label="Minimum salary" htmlFor="filter-salary">
                <Input
                  id="filter-salary"
                  type="number"
                  value={advanced.compensationMin}
                  onChange={(e) => setAdvanced({ ...advanced, compensationMin: e.target.value })}
                />
              </Field>
              <Field label="Company exclusions" htmlFor="filter-exclusions">
                <Input
                  id="filter-exclusions"
                  value={advanced.excludedCompanies}
                  onChange={(e) => setAdvanced({ ...advanced, excludedCompanies: e.target.value })}
                  placeholder="Comma-separated"
                />
              </Field>
              <Field label="Freshness basis" htmlFor="filter-freshness-basis">
                <select
                  id="filter-freshness-basis"
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                  value={advanced.freshnessBasis}
                  onChange={(e) =>
                    setAdvanced({ ...advanced, freshnessBasis: e.target.value as FreshnessBasis })
                  }
                >
                  <option value="discovered">First discovered</option>
                  <option value="originally_posted">Originally posted</option>
                  <option value="reposted">Reposted</option>
                  <option value="last_verified">Last verified</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <ToggleChip
                active={advanced.verifiedOpen}
                onClick={() => setAdvanced({ ...advanced, verifiedOpen: !advanced.verifiedOpen })}
              >
                Verified open only
              </ToggleChip>
              <ToggleChip
                active={advanced.companyDirect}
                onClick={() => setAdvanced({ ...advanced, companyDirect: !advanced.companyDirect })}
              >
                Company-direct only
              </ToggleChip>
              <ToggleChip
                active={advanced.includeReposts}
                onClick={() => setAdvanced({ ...advanced, includeReposts: !advanced.includeReposts })}
              >
                Include reposts
              </ToggleChip>
              <ToggleChip
                active={advanced.hideDuplicates}
                onClick={() => setAdvanced({ ...advanced, hideDuplicates: !advanced.hideDuplicates })}
              >
                Hide possible duplicates
              </ToggleChip>
            </div>
            <Button
              type="button"
              onClick={() => {
                setFiltersOpen(false);
                writeUrl({
                  arrangement: arrangement === "any" ? undefined : arrangement,
                  company: advanced.company || undefined,
                  employmentType: advanced.employmentType || undefined,
                  seniority: advanced.seniority || undefined,
                  sponsorship: advanced.sponsorship || undefined,
                  compensationMin: advanced.compensationMin || undefined,
                  freshnessBasis: advanced.freshnessBasis,
                  freshnessPreset: advanced.freshnessPreset,
                  includeReposts: advanced.includeReposts ? undefined : "0",
                  hideDuplicates: advanced.hideDuplicates ? "1" : undefined,
                  requireOriginal: advanced.requireOriginal ? "1" : undefined,
                  excludedCompanies: advanced.excludedCompanies || undefined,
                  verifiedOpen: advanced.verifiedOpen ? "1" : undefined,
                  companyDirect: advanced.companyDirect ? "1" : undefined,
                  q: q.trim() || undefined,
                  location: location.trim() || undefined,
                });
              }}
            >
              Apply filters
            </Button>
          </DialogContent>
        </Dialog>
        <Button type="button" onClick={() => void runSearch()}>
          Search
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-3" aria-label="Search tools">
            <Link href="/app/radar/saved" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Saved searches
            </Link>
            <Button type="button" variant="secondary" size="sm" onClick={() => setSaveSearchOpen(true)}>
              Save search
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => setAlertOpen(true)}>
              Create alert
            </Button>
            <Link href="/app/radar/alerts" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              Alerts
            </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          filters.q ? `Keywords: ${filters.q}` : null,
          filters.location ? `Location: ${filters.location}` : null,
          filters.arrangement && filters.arrangement !== "any" ? filters.arrangement : null,
          filters.sponsorship ? `Sponsorship: ${filters.sponsorship}` : null,
          filters.company ? `Company: ${filters.company}` : null,
          filters.seniority ? `Seniority: ${filters.seniority}` : null,
        ]
          .filter(Boolean)
          .map((chip) => (
            <span key={String(chip)} className="rounded-md border border-border px-2 py-1 text-xs">
              {chip}
            </span>
          ))}
        {hasFilters ? (
          <Button type="button" size="sm" variant="ghost" onClick={resetFilters}>
            Reset filters
          </Button>
        ) : null}
      </div>

      <Dialog open={saveSearchOpen} onOpenChange={setSaveSearchOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save this search</DialogTitle>
          </DialogHeader>
          <SavedSearchForm
            initialQuery={filters}
            submitting={savingSearch}
            onSubmit={async ({ name, query }) => {
              setSavingSearch(true);
              try {
                await radarApi.saveSearch({ name, query });
                toast.success("Search saved");
                setSaveSearchOpen(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not save search");
              } finally {
                setSavingSearch(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create alert from current filters</DialogTitle>
          </DialogHeader>
          <AlertForm
            initialQuery={filters}
            submitting={savingSearch}
            onSubmit={async (input) => {
              setSavingSearch(true);
              try {
                await radarApi.createAlert(input);
                toast.success("In-app alert created. Email stays off until a provider is configured.");
                setAlertOpen(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not create alert");
              } finally {
                setSavingSearch(false);
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2" role="tablist" aria-label="Job views">
        {(
          [
            ["best", "Best matches"],
            ["newest", "New"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={filters.tab === id}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
              filters.tab === id
                ? "bg-surface-2 text-foreground"
                : "text-foreground-secondary hover:text-foreground",
            )}
            onClick={() => writeUrl({ tab: id })}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-xs text-foreground-muted">{total} roles</span>
      </div>

      {error ? (
        <ErrorState title="Could not load jobs" description={error} onRetry={() => void load()} />
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
        <section
          className="overflow-hidden rounded-md border border-border bg-background"
          aria-label="Job results"
          aria-busy={loading || refreshing}
          data-pending-kind={pendingKind}
        >
          {loading && jobs.length === 0 ? (
            <div className="space-y-0 p-3">
              <Skeleton className="mb-2 h-16 w-full" />
              <Skeleton className="mb-2 h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : jobs.length === 0 && !error ? (
            <EmptyState
              title={filters.tab === "saved" && !hasFilters ? "No saved jobs yet" : "No matching roles"}
              description={filters.tab === "saved" && !hasFilters ? "Save a job to find it here later." : "Try a broader search or clear filters."}
              action={
                <Button
                  type="button"
                  variant="secondary"
                  onClick={filters.tab === "saved" && !hasFilters ? () => writeUrl({ tab: "best" }) : resetFilters}
                >
                  {filters.tab === "saved" && !hasFilters ? "Browse jobs" : "Clear filters"}
                </Button>
              }
            />
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={!isNarrow && selected?.id === job.id}
                onSelect={selectJob}
                navigateOnSelect={isNarrow}
                onSave={save}
                onHide={hide}
                onTailorResume={tailor}
                busy={pendingJobId === job.id}
                tailoring={tailoringId === job.id}
              />
            ))
          )}
          {refreshing ? (
            <p className="px-3 py-1 text-xs text-foreground-muted" data-testid="jobs-refreshing">
              Updating results…
            </p>
          ) : null}
          {nextCursor ? (
            <div className="p-3">
              <Button type="button" variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </section>

        <aside className={cn("hidden lg:block", selected ? "lg:sticky lg:top-20 lg:self-start" : "")}>
          {selected && !error ? (
            <JobDetailPanel
              job={selected}
              compact
              onTailorResume={() => void tailor(selected)}
              onSave={() => void save(selected)}
              onHide={() => void hide(selected)}
              tailoring={tailoringId === selected.id}
              actionPending={pendingJobId === selected.id}
            />
          ) : (
            <div className="flex min-h-64 items-center justify-center border border-dashed border-border px-6 text-center text-sm text-foreground-muted">
              Select a role to review fit and team signals
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-ring",
        active ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-foreground-secondary",
      )}
    >
      {children}
    </button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
