"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SectionHeader, StatusBadge } from "@/components/layout/page-header";
import { WorkflowJourney } from "@/components/applications/workflow-journey";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar, ScoreRing } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";
import { activities, applications, resumes } from "@/data/seed";
import { api } from "@/services/api";
import { formatDate, formatRelative } from "@/lib/utils";
import type { Application, FinalQACheck } from "@/types/domain";

export default function OpportunityOverviewPage() {
  const params = useParams<{ opportunityId: string }>();
  const [app, setApp] = useState<Application | undefined>(
    applications.find((a) => a.id === params.opportunityId),
  );
  const [qa, setQa] = useState<FinalQACheck[]>([]);

  useEffect(() => {
    void api.getApplication(params.opportunityId).then((a) => setApp(a));
    void api.getFinalQA().then(setQa);
  }, [params.opportunityId]);

  if (!app) {
    return <p className="text-sm text-foreground-muted">Opportunity not found.</p>;
  }

  const resume = resumes.find((r) => r.applicationId === app.id) ?? resumes[0];
  const timeline = activities.filter((a) => a.applicationId === app.id);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Opportunity control center</CardTitle>
            <CardDescription>
              Research → Evidence → Resume → Audits → Application Copilot
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-foreground-secondary">
              Next recommended action: <span className="font-medium text-foreground">{app.nextAction}</span>
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Research" value={`${app.researchConfidence}%`} />
              <Metric label="Evidence" value={`${app.evidenceCoverage}%`} />
              <Metric label="Resume" value={app.resumeScore ? `${app.resumeScore}` : "—"} />
              <Metric label="Pipeline" value={app.status} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/app/opportunities/${app.id}/research`} className={buttonVariants({ size: "sm" })}>
                Continue research
              </Link>
              <Link
                href={`/app/opportunities/${app.id}/application`}
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                Open Application Copilot
              </Link>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CandidArc Readiness</CardTitle>
            <CardDescription>Not a guarantee of interviews — a quality confidence score.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <ScoreRing score={app.resumeScore} />
            <div className="space-y-2 text-sm">
              <p>
                Current resume: <span className="font-medium">{resume?.versions.find((v) => v.id === resume.currentVersionId)?.versionLabel ?? "—"}</span>
              </p>
              <StatusBadge status={app.status} />
            </div>
          </CardContent>
        </Card>
      </section>

      <section>
        <SectionHeader title="Generation journey" description="Each audit reviews the regenerated draft that came before it." />
        <WorkflowJourney currentStage={app.stage} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Final QA</CardTitle>
            <CardDescription>Deterministic checks must actually run before passing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {qa.slice(0, 6).map((check) => (
              <div key={check.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{check.label}</span>
                <StatusBadge status={check.status === "pass" ? "ready" : check.status === "fail" ? "auditing" : "draft"} />
              </div>
            ))}
            {qa.length === 0 ? <p className="text-sm text-foreground-muted">QA results load with the final workflow.</p> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Recent workspace events</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {timeline.slice(0, 6).map((event) => (
              <div key={event.id} className="text-sm">
                <p className="font-medium">{event.title}</p>
                <p className="text-foreground-muted">
                  {formatRelative(event.timestamp)}
                  {event.timestamp ? ` · ${formatDate(event.timestamp)}` : null}
                </p>
              </div>
            ))}
            <Link href={`/app/opportunities/${app.id}/activity`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              View full activity
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
      {label === "Evidence" ? <ProgressBar value={Number(value.replace("%", "")) || 0} className="mt-2" /> : null}
    </div>
  );
}
