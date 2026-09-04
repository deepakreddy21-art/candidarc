"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bell, Radar, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { JobCard } from "@/components/radar/job-card";
import { RadarHomeSummaryCards } from "@/components/radar/radar-home-summary";
import { FreshnessControls, type FreshnessControlsValue } from "@/components/radar/freshness-controls";
import { RepostFilter } from "@/components/radar/repost-filter";
import { radarApi } from "@/services/radar-api";
import type {
  FreshnessTypeFilter,
  RadarHomeSummary,
  RadarJob,
  SavedSearch,
  SourceCoverageSummary,
} from "@/types/radar";
import { cn } from "@/lib/utils";

export default function RadarHomePage() {
  const router = useRouter();
  const [q, setQ] = useState("AI software engineer");
  const [location, setLocation] = useState("");
  const [freshness, setFreshness] = useState<FreshnessControlsValue>({
    preset: "7d",
    basis: "discovered",
  });
  const [freshnessType, setFreshnessType] = useState<FreshnessTypeFilter | "any">("new_or_reposted");
  const [jobs, setJobs] = useState<RadarJob[]>([]);
  const [summary, setSummary] = useState<RadarHomeSummary | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [coverage, setCoverage] = useState<SourceCoverageSummary | null>(null);
  const [demoMode, setDemoMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [search, homeSummary, saved, sources] = await Promise.all([
          radarApi.searchJobs({ sort: "best_match", limit: 40 }),
          radarApi.getHomeSummary(),
          radarApi.listSavedSearches(),
          radarApi.getSourceCoverage(),
        ]);
        if (cancelled) return;
        setJobs(search.jobs);
        setDemoMode(!!search.usingDemoFixtures);
        setSummary(homeSummary);
        setSavedSearches(saved);
        setCoverage(sources);
      } catch {
        toast.error("Could not load Radar");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const recommended = useMemo(
    () => [...jobs].sort((a, b) => b.matchScore - a.matchScore).slice(0, 3),
    [jobs],
  );
  const newlyDiscovered = useMemo(
    () => jobs.filter((j) => j.classification === "NEW").slice(0, 3),
    [jobs],
  );
  const recentlyReposted = useMemo(
    () => jobs.filter((j) => j.classification === "REPOSTED").slice(0, 3),
    [jobs],
  );
  const companyDirect = useMemo(
    () => jobs.filter((j) => j.companyDirect).slice(0, 3),
    [jobs],
  );

  function runSearch() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (location.trim()) params.set("location", location.trim());
    if (freshness.preset) params.set("freshnessPreset", freshness.preset);
    params.set("freshnessBasis", freshness.basis);
    if (freshness.preset === "custom") {
      if (freshness.customStart) params.set("customStart", freshness.customStart);
      if (freshness.customEnd) params.set("customEnd", freshness.customEnd);
      if (freshness.timezone) params.set("timezone", freshness.timezone);
    }
    if (freshnessType !== "any") params.set("freshnessType", freshnessType);
    router.push(`/app/radar/search?${params.toString()}`);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Radar"
        description="Find genuinely fresh opportunities, understand when a listing was actually created, and know whether a “new” job is only a repost."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/radar/saved" className={buttonVariants({ variant: "secondary" })}>
              Saved
            </Link>
            <Link href="/app/radar/alerts" className={buttonVariants({ variant: "secondary" })}>
              <Bell className="h-4 w-4" />
              Alerts
            </Link>
            <Link href="/app/radar/sources" className={buttonVariants({ variant: "outline" })}>
              Sources
            </Link>
          </div>
        }
      />

      {demoMode ? (
        <div className="rounded-xl border border-border bg-[color-mix(in_oklab,var(--cyan)_8%,transparent)] px-4 py-3 text-sm text-foreground-secondary">
          Showing demo catalog fixtures. LinkedIn-shaped sightings are labeled and are{" "}
          <span className="font-medium text-foreground">not</span> a live LinkedIn connection.
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-cyan">
            <Radar className="h-5 w-5" />
            <p className="text-sm font-medium">Multi-source job intelligence</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="radar-q">Role or keywords</Label>
              <Input
                id="radar-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="AI engineer, RAG, inference…"
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="radar-loc">Location</Label>
              <Input
                id="radar-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Remote, San Francisco…"
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full lg:w-auto" onClick={runSearch}>
                <Search className="h-4 w-4" />
                Search Radar
              </Button>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <FreshnessControls value={freshness} onChange={setFreshness} compact />
            <RepostFilter value={freshnessType} onChange={setFreshnessType} />
          </div>
        </CardContent>
      </Card>

      {summary ? <RadarHomeSummaryCards summary={summary} /> : null}

      <JobStrip
        title="Recommended for you"
        description="Strong profile and evidence overlap"
        jobs={recommended}
      />
      <JobStrip
        title="Newly discovered"
        description="Genuinely new requisitions"
        jobs={newlyDiscovered}
        empty="No genuinely new roles in the current demo window."
      />
      <JobStrip
        title="Recently reposted"
        description="Previously known roles appearing again on boards"
        jobs={recentlyReposted}
        empty="No reposts in the current catalog."
      />
      <JobStrip
        title="Company-direct"
        description="Prefer employer career pages and ATS boards"
        jobs={companyDirect}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Saved searches</CardTitle>
            <CardDescription>Reopen or alert on complete filter state</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {savedSearches.length === 0 ? (
              <p className="text-sm text-foreground-muted">No saved searches yet.</p>
            ) : (
              savedSearches.map((s) => (
                <Link
                  key={s.id}
                  href={`/app/radar/search?${new URLSearchParams(
                    Object.entries(s.query)
                      .filter(([, v]) => v !== undefined && v !== "")
                      .map(([k, v]) => [k, String(v)]),
                  ).toString()}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-3 hover:bg-surface-2"
                >
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-foreground-muted">
                      {s.query.q ?? "Any keywords"}
                      {s.alertEnabled ? " · alert on" : ""}
                    </p>
                  </div>
                  <Sparkles className="h-4 w-4 text-cyan" />
                </Link>
              ))
            )}
            <Link href="/app/radar/saved" className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>
              Manage saved
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Source coverage</CardTitle>
            <CardDescription>Honest status — no unsupported claims</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-foreground-secondary">
              {coverage?.summary ??
                "Company careers, public ATS boards, and licensed providers when available."}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(coverage?.items ?? []).slice(0, 6).map((item) => (
                <Badge key={item.id} tone={item.enabled ? "success" : "neutral"}>
                  {item.name}: {item.enabled ? "on" : "off"}
                </Badge>
              ))}
            </div>
            <Link href="/app/radar/sources" className="text-sm font-medium text-accent hover:underline">
              View source policies
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function JobStrip({
  title,
  description,
  jobs,
  empty,
}: {
  title: string;
  description: string;
  jobs: RadarJob[];
  empty?: string;
}) {
  return (
    <section>
      <SectionHeader title={title} description={description} />
      {jobs.length === 0 ? (
        <p className="text-sm text-foreground-muted">{empty ?? "Nothing to show yet."}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} dense />
          ))}
        </div>
      )}
    </section>
  );
}
