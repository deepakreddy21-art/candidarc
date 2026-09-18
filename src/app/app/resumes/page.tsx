"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { customerResumePath, mapResumeProgress } from "@/lib/application-presentation";
import { formatRelative } from "@/lib/utils";
import { api, isCancelledError } from "@/services/api";
import type { Application } from "@/types/domain";

export default function ResumesPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setError(null);
    try {
      const items = await api.listApplications();
      if (id !== requestId.current) return;
      setApps(items.filter((app) => !app.archived && Boolean(customerResumePath(app))));
      setLoaded(true);
    } catch (err) {
      if (isCancelledError(err) || id !== requestId.current) return;
      setError(err instanceof Error ? err.message.replace(/applications/i, "resumes") : "Could not load resumes");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Resumes"
        description="Tailored resumes for jobs you are working."
        actions={
          <Link href="/app/resumes/new" className={buttonVariants()}>
            Tailor a job I found
          </Link>
        }
      />

      {!loaded ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading resumes</span>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {loaded && error ? <ErrorState description={error} onRetry={() => { setLoaded(false); void load(); }} /> : null}

      {loaded && !error && apps.length === 0 ? (
        <EmptyState
          title="No tailored resumes yet"
          description="Pick a job in Radar, then tailor a resume from your career evidence."
          action={
            <Link href="/app/radar" className={buttonVariants({ variant: "secondary" })}>
              Browse jobs
            </Link>
          }
        />
      ) : null}

      {loaded && !error && apps.length > 0 ? (
        <>
          <Input
            aria-label="Search resumes"
            placeholder="Search by company or role"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface" data-testid="resume-list">
            {apps
              .filter((app) => {
                const hay = `${app.role} ${app.company}`.toLowerCase();
                return hay.includes(query.trim().toLowerCase());
              })
              .map((app) => {
                const href = customerResumePath(app);
                if (!href) return null;
                return (
                  <li key={app.id}>
                    <Link href={href} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {app.role} · {app.company}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          Updated {formatRelative(app.updatedAt)} · Added {formatRelative(app.createdAt)}
                        </p>
                      </div>
                      <span className="rounded-md border border-border px-2 py-0.5 text-xs">{mapResumeProgress(app)}</span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
