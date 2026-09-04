"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, Bookmark, Filter, Radar, Search, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { JobCard } from "@/components/radar/job-card";
import { JobDetailPanel } from "@/components/radar/job-detail-panel";
import { radarApi } from "@/services/radar-api";
import type {
  FreshnessBasis,
  FreshnessPreset,
  RadarJob,
  RadarSearchParams,
  RemotePolicy,
} from "@/types/radar";
import { cn } from "@/lib/utils";

type FeedTab = "best" | "newest" | "reposted" | "saved";

const FRESHNESS_SHORTCUTS: Array<{ key: FreshnessPreset; label: string }> = [
  { key: "1h", label: "Last 1 hour" },
  { key: "3h", label: "Last 3 hours" },
  { key: "24h", label: "Last 24 hours" },
  { key: "7d", label: "Last 7 days" },
  { key: "custom", label: "Custom" },
];

function paramsFromUrl(sp: URLSearchParams): RadarSearchParams & { tab: FeedTab; arrangement: RemotePolicy | "any" } {
  const tab = (sp.get("tab") as FeedTab) || "best";
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
    compensationMin: sp.get("compensationMin") ? Number(sp.get("compensationMin")) : undefined,
    includeReposts: sp.get("includeReposts") !== "0",
    hidePossibleDuplicates: sp.get("hideDuplicates") === "1",
    requireKnownOriginalDate: sp.get("requireOriginal") === "1",
    customStart: sp.get("customStart") ?? undefined,
    customEnd: sp.get("customEnd") ?? undefined,
    timezone: sp.get("timezone") ?? undefined,
    excludedCompanies: sp.get("excludedCompanies") ?? undefined,
    tab,
    limit: 20,
    sort:
      tab === "newest"
        ? "recently_discovered"
        : tab === "reposted"
          ? "recently_reposted"
          : "best_match",
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
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [chips, setChips] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advanced, setAdvanced] = useState({
    company: filters.company ?? "",
    employmentType: filters.employmentType ?? "",
    seniority: filters.seniority ?? "",
    compensationMin: filters.compensationMin?.toString() ?? "",
    freshnessBasis: filters.freshnessBasis ?? "discovered",
    includeReposts: filters.includeReposts !== false,
    hideDuplicates: !!filters.hidePossibleDuplicates,
    requireOriginal: !!filters.requireKnownOriginalDate,
    excludedCompanies: filters.excludedCompanies ?? "",
    customStart: filters.customStart ?? "",
    customEnd: filters.customEnd ?? "",
    timezone: filters.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  const writeUrl = useCallback(
    (patch: Record<string, string | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === "" || value === "any" || value === "false" || value === "0") next.delete(key);
        else next.set(key, value);
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await radarApi.searchJobs({
        q: filters.q,
        location: filters.location,
        remote: arrangement === "any" ? undefined : arrangement,
        freshnessPreset: filters.freshnessPreset,
        freshnessBasis: filters.freshnessBasis,
        freshnessType: filters.tab === "reposted" ? "reposted_only" : filters.freshnessType,
        verifiedOpenOnly: filters.verifiedOpenOnly,
        companyDirectOnly: filters.companyDirectOnly,
        company: filters.company,
        employmentType: filters.employmentType,
        seniority: filters.seniority,
        compensationMin: filters.compensationMin,
        includeReposts: filters.includeReposts,
        hidePossibleDuplicates: filters.hidePossibleDuplicates,
        requireKnownOriginalDate: filters.requireKnownOriginalDate,
        customStart: filters.customStart,
        customEnd: filters.customEnd,
        timezone: filters.timezone,
        excludedCompanies: filters.excludedCompanies,
        sort: filters.sort,
        limit: 20,
      });
      const nextJobs = filters.tab === "saved" ? result.jobs.filter((job) => job.saved) : result.jobs;
      setJobs(nextJobs);
      setTotal(filters.tab === "saved" ? nextJobs.length : result.total);
      setSelectedId((current) => current && nextJobs.some((job) => job.id === current) ? current : nextJobs[0]?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load jobs");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [arrangement, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setQ(filters.q ?? "");
    setLocation(filters.location ?? "");
    setArrangement(filters.arrangement);
  }, [filters.arrangement, filters.location, filters.q]);

  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];

  async function runSearch(extra?: Record<string, string | undefined>) {
    let nextQ = q.trim();
    const nextChips: string[] = [];
    if (nextQ.split(/\s+/).length >= 6 || /posted|requiring|remote|last /i.test(nextQ)) {
      try {
        const parsed = await radarApi.parseSearch(nextQ);
        const understood = Object.entries(parsed.parsedFilters ?? {})
          .filter(([, value]) => Boolean(value))
          .map(([key, value]) => `${key}: ${value}`);
        if (understood.length) nextChips.push(...understood.slice(0, 6));
        if (parsed.query.location && !location) setLocation(parsed.query.location);
        if (parsed.query.remote && parsed.query.remote !== "any") setArrangement(parsed.query.remote);
        if (parsed.query.q) nextQ = parsed.query.q;
      } catch {
        // Keep ordinary keyword search when NL parsing fails.
      }
    }
    setChips(nextChips);
    writeUrl({
      q: nextQ || undefined,
      location: location.trim() || undefined,
      arrangement: arrangement === "any" ? undefined : arrangement,
      freshnessPreset: filters.freshnessPreset,
      ...extra,
    });
  }

  async function tailor(job: RadarJob) {
    try {
      const result = await radarApi.tailorResume(job.id);
      router.push(`/app/resumes/${result.workflowId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start resume generation");
    }
  }

  async function save(job: RadarJob) {
    try {
      if (job.saved) await radarApi.unsaveJob(job.id);
      else await radarApi.saveJob(job.id);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update saved job");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Radar"
        description="Broad job-source coverage and company-direct discovery — not every job on the internet."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/radar/saved" className={buttonVariants({ variant: "secondary" })}>
              <Bookmark className="h-4 w-4" />
              Saved
            </Link>
            <Link href="/app/radar/alerts" className={buttonVariants({ variant: "secondary" })}>
              <Bell className="h-4 w-4" />
              Alerts
            </Link>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="space-y-2">
            <Label htmlFor="radar-q">Search</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
                <Input
                  id="radar-q"
                  className="pl-9"
                  value={q}
                  onChange={(event) => setQ(event.target.value)}
                  placeholder="Describe the job you want"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runSearch();
                  }}
                />
              </div>
              <Button type="button" onClick={() => void runSearch()}>
                Search
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="radar-location">Location</Label>
              <Input id="radar-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City or region" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="radar-arrangement">Work arrangement</Label>
              <select
                id="radar-arrangement"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={arrangement}
                onChange={(event) => setArrangement(event.target.value as RemotePolicy | "any")}
              >
                <option value="any">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Freshness</Label>
              <div className="flex flex-wrap gap-2">
                {FRESHNESS_SHORTCUTS.map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    size="sm"
                    variant={filters.freshnessPreset === item.key ? "default" : "secondary"}
                    onClick={() => void runSearch({ freshnessPreset: item.key })}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ToggleChip
              active={searchParams.get("genuinelyNew") === "1"}
              onClick={() => writeUrl({ genuinelyNew: searchParams.get("genuinelyNew") === "1" ? undefined : "1" })}
            >
              Genuinely new only
            </ToggleChip>
            <ToggleChip
              active={searchParams.get("verifiedOpen") === "1"}
              onClick={() => writeUrl({ verifiedOpen: searchParams.get("verifiedOpen") === "1" ? undefined : "1" })}
            >
              Verified open only
            </ToggleChip>
            <ToggleChip
              active={searchParams.get("companyDirect") === "1"}
              onClick={() => writeUrl({ companyDirect: searchParams.get("companyDirect") === "1" ? undefined : "1" })}
            >
              Company-direct only
            </ToggleChip>
            <Dialog open={advancedOpen} onOpenChange={setAdvancedOpen}>
              <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  <SlidersHorizontal className="h-4 w-4" />
                  Advanced filters
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Advanced filters</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Company"><Input value={advanced.company} onChange={(e) => setAdvanced({ ...advanced, company: e.target.value })} /></Field>
                  <Field label="Employment type"><Input value={advanced.employmentType} onChange={(e) => setAdvanced({ ...advanced, employmentType: e.target.value })} /></Field>
                  <Field label="Seniority"><Input value={advanced.seniority} onChange={(e) => setAdvanced({ ...advanced, seniority: e.target.value })} /></Field>
                  <Field label="Minimum compensation"><Input type="number" value={advanced.compensationMin} onChange={(e) => setAdvanced({ ...advanced, compensationMin: e.target.value })} /></Field>
                  <Field label="Freshness basis">
                    <select className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm" value={advanced.freshnessBasis} onChange={(e) => setAdvanced({ ...advanced, freshnessBasis: e.target.value as FreshnessBasis })}>
                      <option value="discovered">First discovered</option>
                      <option value="originally_posted">Originally posted</option>
                      <option value="reposted">Reposted</option>
                      <option value="last_verified">Last verified</option>
                    </select>
                  </Field>
                  <Field label="Timezone"><Input value={advanced.timezone} onChange={(e) => setAdvanced({ ...advanced, timezone: e.target.value })} /></Field>
                  <Field label="Custom start"><Input type="datetime-local" value={advanced.customStart} onChange={(e) => setAdvanced({ ...advanced, customStart: e.target.value })} /></Field>
                  <Field label="Custom end"><Input type="datetime-local" value={advanced.customEnd} onChange={(e) => setAdvanced({ ...advanced, customEnd: e.target.value })} /></Field>
                  <Field label="Excluded companies"><Input value={advanced.excludedCompanies} onChange={(e) => setAdvanced({ ...advanced, excludedCompanies: e.target.value })} placeholder="Comma-separated" /></Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ToggleChip active={advanced.includeReposts} onClick={() => setAdvanced({ ...advanced, includeReposts: !advanced.includeReposts })}>Include reposts</ToggleChip>
                  <ToggleChip active={advanced.hideDuplicates} onClick={() => setAdvanced({ ...advanced, hideDuplicates: !advanced.hideDuplicates })}>Hide possible duplicates</ToggleChip>
                  <ToggleChip active={advanced.requireOriginal} onClick={() => setAdvanced({ ...advanced, requireOriginal: !advanced.requireOriginal })}>Require known original date</ToggleChip>
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    setAdvancedOpen(false);
                    writeUrl({
                      company: advanced.company || undefined,
                      employmentType: advanced.employmentType || undefined,
                      seniority: advanced.seniority || undefined,
                      compensationMin: advanced.compensationMin || undefined,
                      freshnessBasis: advanced.freshnessBasis,
                      includeReposts: advanced.includeReposts ? undefined : "0",
                      hideDuplicates: advanced.hideDuplicates ? "1" : undefined,
                      requireOriginal: advanced.requireOriginal ? "1" : undefined,
                      excludedCompanies: advanced.excludedCompanies || undefined,
                      customStart: advanced.customStart || undefined,
                      customEnd: advanced.customEnd || undefined,
                      timezone: advanced.timezone || undefined,
                      freshnessPreset: advanced.customStart || advanced.customEnd ? "custom" : filters.freshnessPreset,
                    });
                  }}
                >
                  Apply filters
                </Button>
              </DialogContent>
            </Dialog>
          </div>

          {chips.length ? (
            <div className="flex flex-wrap gap-2" aria-label="Understood search filters">
              {chips.map((chip) => (
                <Badge key={chip} tone="accent">{chip}</Badge>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Result views">
        {(
          [
            ["best", "Best matches"],
            ["newest", "Newest"],
            ["reposted", "Reposted"],
            ["saved", "Saved"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            role="tab"
            aria-selected={filters.tab === id}
            variant={filters.tab === id ? "default" : "secondary"}
            onClick={() => writeUrl({ tab: id })}
          >
            {label}
          </Button>
        ))}
        <span className="ml-auto self-center text-xs text-foreground-muted">{total} roles</span>
      </div>

      {error ? <ErrorState title="Radar could not load jobs" description={error} onRetry={() => void load()} /> : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-3" aria-label="Job results">
          {loading ? (
            <>
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </>
          ) : jobs.length === 0 && !error ? (
            <EmptyState
              title="No matching roles"
              description="Try broader keywords, a longer freshness window, or turn off “genuinely new only.”"
              action={
                <Button type="button" variant="secondary" onClick={() => writeUrl({ genuinelyNew: undefined, verifiedOpen: undefined, companyDirect: undefined, q: undefined })}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                selected={selected?.id === job.id}
                onSelect={setSelectedId}
                onSave={save}
                onTailorResume={tailor}
              />
            ))
          )}
        </section>

        <aside className={cn("hidden lg:block", selected ? "lg:sticky lg:top-20 lg:self-start" : "")}>
          {selected ? (
            <JobDetailPanel
              job={selected}
              onTailorResume={() => void tailor(selected)}
              onSave={() => void save(selected)}
            />
          ) : (
            <Card>
              <CardContent className="flex min-h-64 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-foreground-muted">
                <Radar className="h-8 w-8" />
                Select a role to review details
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      {selected ? (
        <div className="lg:hidden">
          <JobDetailPanel job={selected} onTailorResume={() => void tailor(selected)} onSave={() => void save(selected)} />
        </div>
      ) : null}
    </div>
  );
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-ring",
        active ? "border-accent bg-accent/10 text-foreground" : "border-border bg-background text-foreground-secondary",
      )}
    >
      <Filter className="h-3 w-3" aria-hidden />
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
