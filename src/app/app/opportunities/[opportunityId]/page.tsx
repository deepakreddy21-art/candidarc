"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import {
  customerNextAction,
  defaultCandidateStatus,
  mapResumeProgress,
} from "@/lib/application-presentation";
import { formatRelative } from "@/lib/utils";
import { api } from "@/services/api";
import type { Application } from "@/types/domain";

/** Deep-link overview for a single application — customer-facing, no internal pipeline UI. */
export default function OpportunityOverviewPage() {
  const params = useParams<{ opportunityId: string }>();
  const router = useRouter();
  const [app, setApp] = useState<Application | null | undefined>(undefined);

  useEffect(() => {
    void api.getApplication(params.opportunityId).then((found) => setApp(found ?? null));
  }, [params.opportunityId]);

  if (app === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <EmptyState
        title="Application not found"
        description="It may have been archived or you may not have access."
        action={
          <Link href="/app/opportunities" className={buttonVariants()}>
            Back to Applications
          </Link>
        }
      />
    );
  }

  const resume = mapResumeProgress(app);
  const status = defaultCandidateStatus(app);
  const next = customerNextAction({ ...app, candidateStatus: status });

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={app.role}
        description={`${app.company}${app.location ? ` · ${app.location}` : ""}`}
        actions={
          <Link href="/app/opportunities" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            All applications
          </Link>
        }
      />

      <dl className="grid gap-3 border border-border p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Resume</dt>
          <dd className="mt-1 font-medium">{resume}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Application status</dt>
          <dd className="mt-1 font-medium">{status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Added</dt>
          <dd className="mt-1">{formatRelative(app.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Next action</dt>
          <dd className="mt-1">{next}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {app.workflowId || app.resumeId ? (
          <button
            type="button"
            className={buttonVariants()}
            onClick={() => router.push(`/app/resumes/${app.workflowId ?? app.resumeId}`)}
          >
            View resume
          </button>
        ) : null}
        <Link href="/app/radar" className={buttonVariants({ variant: "secondary" })}>
          Browse jobs
        </Link>
      </div>
    </div>
  );
}
