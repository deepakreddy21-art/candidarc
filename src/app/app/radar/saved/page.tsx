"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { JobCard } from "@/components/radar/job-card";
import { SavedSearchForm } from "@/components/radar/saved-search-form";
import { radarApi } from "@/services/radar-api";
import type { RadarJob, SavedSearch } from "@/types/radar";
import { formatRelative } from "@/lib/utils";

export default function RadarSavedPage() {
  const [savedJobs, setSavedJobs] = useState<RadarJob[]>([]);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      const [all, savedSearches] = await Promise.all([
        radarApi.searchJobs({ limit: 100 }),
        radarApi.listSavedSearches(),
      ]);
      setSavedJobs(all.jobs.filter((j) => j.saved));
      setSearches(savedSearches);
    } catch {
      toast.error("Could not load saved Radar items");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Saved"
        description="Saved jobs and searchable filter presets for CandidArc Radar."
        actions={
          <Link href="/app/radar/search" className={buttonVariants()}>
            Back to search
          </Link>
        }
      />

      <section className="space-y-4">
        <h2 className="text-[20px] font-semibold tracking-tight">Saved jobs</h2>
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : savedJobs.length === 0 ? (
          <EmptyState
            title="No saved jobs"
            description="Save roles from search results to revisit freshness and match details later."
            action={
              <Link href="/app/radar/search" className={buttonVariants({ variant: "secondary" })}>
                Browse Radar
              </Link>
            }
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {savedJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onSave={async (j) => {
                  await radarApi.unsaveJob(j.id);
                  setSavedJobs((prev) => prev.filter((x) => x.id !== j.id));
                  toast.success("Removed from saved");
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <h2 className="text-[20px] font-semibold tracking-tight">Saved searches</h2>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : searches.length === 0 ? (
            <EmptyState
              title="No saved searches"
              description="Save a complete filter state from search to reopen or attach alerts."
            />
          ) : (
            <div className="space-y-3">
              {searches.map((s) => {
                const qs = new URLSearchParams(
                  Object.entries(s.query)
                    .filter(([, v]) => v !== undefined && v !== "" && v !== false)
                    .map(([k, v]) => [k, String(v)]),
                ).toString();
                return (
                  <Card key={s.id}>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-foreground-muted">
                          Updated {formatRelative(s.updatedAt)}
                          {s.alertEnabled ? " · alert enabled" : ""}
                        </p>
                      </div>
                      <Link
                        href={`/app/radar/search?${qs}`}
                        className={buttonVariants({ variant: "secondary", size: "sm" })}
                      >
                        Open
                      </Link>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Save current defaults</CardTitle>
            <CardDescription>Quickly store a remote AI search preset</CardDescription>
          </CardHeader>
          <CardContent>
            <SavedSearchForm
              initialQuery={{
                q: "AI engineer",
                remote: "remote",
                freshnessPreset: "7d",
                freshnessBasis: "discovered",
                freshnessType: "new_or_reposted",
                matchScoreMin: 70,
                sort: "best_match",
              }}
              onSubmit={async (input) => {
                await radarApi.saveSearch(input);
                toast.success("Search saved");
                await reload();
              }}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
