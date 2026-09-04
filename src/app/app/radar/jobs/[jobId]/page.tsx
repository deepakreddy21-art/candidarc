"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton, ErrorState } from "@/components/ui/feedback";
import { JobDetailPanel } from "@/components/radar/job-detail-panel";
import { SourceHistoryTimeline } from "@/components/radar/source-history-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { radarApi } from "@/services/radar-api";
import type { RadarHistoryEvent, RadarJob } from "@/types/radar";

export default function RadarJobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const router = useRouter();
  const jobId = params.jobId;
  const [job, setJob] = useState<RadarJob | null>(null);
  const [history, setHistory] = useState<RadarHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tailoring, setTailoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [j, h] = await Promise.all([
          radarApi.getJob(jobId),
          radarApi.getJobHistory(jobId),
        ]);
        if (cancelled) return;
        if (!j) {
          setError("Job not found");
          setJob(null);
        } else {
          setJob(j);
          setHistory(h);
        }
      } catch {
        if (!cancelled) setError("Could not load job");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <ErrorState
        title="Job unavailable"
        description={error ?? "This Radar job could not be found."}
        onRetry={() => router.refresh()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={job.title}
        description={`${job.company} · freshness verification and source history`}
        actions={
          <Link href="/app/radar/search" className={buttonVariants({ variant: "secondary" })}>
            Back to search
          </Link>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <JobDetailPanel
            job={job}
            history={history}
            tailoring={tailoring}
            onSave={async () => {
              if (job.saved) {
                await radarApi.unsaveJob(job.id);
                setJob({ ...job, saved: false });
                toast.success("Removed from saved");
              } else {
                await radarApi.saveJob(job.id);
                setJob({ ...job, saved: true });
                toast.success("Saved job");
              }
            }}
            onHide={async () => {
              await radarApi.hideJob(job.id);
              toast.success("Job hidden");
              router.push("/app/radar/search");
            }}
            onTailorResume={async () => {
              setTailoring(true);
              try {
                const result = await radarApi.tailorResume(job.id);
                toast.success("Resume tailoring started");
                router.push(`/app/resumes/${result.workflowId}`);
              } catch {
                toast.error("Could not start resume tailoring");
              } finally {
                setTailoring(false);
              }
            }}
          />

          <Card>
            <CardHeader>
              <CardTitle>Hiring signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {job.hiringSignals.map((signal) => (
                <p key={signal} className="text-sm text-foreground-secondary">
                  • {signal}
                </p>
              ))}
              {job.technologies.length ? (
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {job.technologies.map((tech) => (
                    <Badge key={tech} tone="cyan">
                      {tech}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <SourceHistoryTimeline events={history} />
          <Card>
            <CardHeader>
              <CardTitle>Sources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {job.sources.map((source) => (
                <div
                  key={source.id}
                  className="rounded-xl border border-border px-3 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{source.name}</p>
                    {source.companyDirect ? <Badge tone="accent">Company direct</Badge> : null}
                    {source.demoData ? <Badge tone="neutral">Demo fixture</Badge> : null}
                  </div>
                  {source.attribution ? (
                    <p className="mt-1.5 text-xs text-foreground-muted">{source.attribution}</p>
                  ) : null}
                </div>
              ))}
              {job.linkedApplicationId ? (
                <Link
                  href={`/app/opportunities/${job.linkedApplicationId}`}
                  className="text-sm font-medium text-accent hover:underline"
                >
                  Open linked application workspace
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

