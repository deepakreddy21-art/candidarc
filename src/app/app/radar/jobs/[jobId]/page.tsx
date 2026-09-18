"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton, ErrorState } from "@/components/ui/feedback";
import { JobDetailPanel } from "@/components/radar/job-detail-panel";
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
        description={error ?? "This job could not be found."}
        onRetry={() => router.refresh()}
      />
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/app/radar" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        ← Back to Jobs
      </Link>
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
          router.push("/app/radar");
        }}
        onTailorResume={async () => {
          setTailoring(true);
          try {
            const result = await radarApi.tailorResume(job.id);
            toast.success("Resume tailoring started");
            router.push(`/app/resumes/${result.workflowId}`);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Could not start resume tailoring";
            if (/profile|onboarding|incomplete/i.test(message)) {
              router.push(`/onboarding?next=${encodeURIComponent(`/app/radar/jobs/${job.id}`)}`);
              return;
            }
            toast.error(message);
          } finally {
            setTailoring(false);
          }
        }}
      />
    </div>
  );
}
