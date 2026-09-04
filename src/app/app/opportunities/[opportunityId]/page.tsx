"use client";



import Link from "next/link";

import { useEffect, useState } from "react";

import { useParams } from "next/navigation";

import { StatusBadge } from "@/components/layout/page-header";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ProgressBar, ScoreRing } from "@/components/ui/feedback";

import { buttonVariants } from "@/components/ui/button";

import { api } from "@/services/api";

import { formatDate, formatRelative } from "@/lib/utils";

import type { Application, FinalQACheck } from "@/types/domain";



export default function OpportunityOverviewPage() {

  const params = useParams<{ opportunityId: string }>();

  const [app, setApp] = useState<Application>();

  const [qa, setQa] = useState<FinalQACheck[]>([]);

  const [timeline, setTimeline] = useState<Array<{ id: string; title: string; description?: string; timestamp: string }>>([]);



  useEffect(() => {

    void api.getApplication(params.opportunityId).then((found) => setApp(found));

    void api.getFinalQA(params.opportunityId).then(setQa);

    void api.listActivities(params.opportunityId).then((events) =>

      setTimeline(

        events.map((event) => ({

          id: event.id,

          title: event.title,

          description: event.description,

          timestamp: event.timestamp,

        })),

      ),

    );

  }, [params.opportunityId]);



  if (!app) {

    return (

      <Card>

        <CardContent className="p-6 text-sm text-foreground-secondary">

          Application not found or still loading.{" "}

          <Link href="/app/opportunities" className="text-accent underline-offset-2 hover:underline">

            Back to My Applications

          </Link>

        </CardContent>

      </Card>

    );

  }



  return (

    <div className="space-y-8">

      <section className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">

        <Card>

          <CardHeader>

            <CardTitle>{app.company}</CardTitle>

            <CardDescription>{app.role}{app.location ? ` · ${app.location}` : ""}</CardDescription>

          </CardHeader>

          <CardContent className="space-y-4">

            <p className="text-sm text-foreground-secondary">

              Next step: <span className="font-medium text-foreground">{app.nextAction}</span>

            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">

              <Metric label="Research" value={`${app.researchConfidence}%`} />

              <Metric label="Evidence" value={`${app.evidenceCoverage}%`} />

              <Metric label="Resume" value={app.resumeScore ? `${app.resumeScore}` : "—"} />

              <Metric label="Status" value={app.status} />

            </div>

            <div className="flex flex-wrap gap-2">

              <Link href="/app/resumes/new" className={buttonVariants({ size: "sm" })}>

                Tailor another resume

              </Link>

              <Link href="/app/opportunities" className={buttonVariants({ variant: "secondary", size: "sm" })}>

                All applications

              </Link>

            </div>

          </CardContent>

        </Card>

        <Card>

          <CardHeader>

            <CardTitle>Readiness</CardTitle>

            <CardDescription>Quality confidence for this tailored application.</CardDescription>

          </CardHeader>

          <CardContent className="flex items-center gap-4">

            <ScoreRing score={app.resumeScore} />

            <div className="space-y-2 text-sm">

              <StatusBadge status={app.status} />

            </div>

          </CardContent>

        </Card>

      </section>



      <div className="grid gap-4 lg:grid-cols-2">

        <Card>

          <CardHeader>

            <CardTitle>Quality checks</CardTitle>

            <CardDescription>Formatting, evidence, and readability validation.</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            {qa.slice(0, 6).map((check) => (

              <div key={check.id} className="flex items-center justify-between gap-3 text-sm">

                <span>{check.label}</span>

                <StatusBadge status={check.status === "pass" ? "ready" : check.status === "fail" ? "auditing" : "draft"} />

              </div>

            ))}

            {qa.length === 0 ? <p className="text-sm text-foreground-muted">Checks appear when your resume finishes generating.</p> : null}

          </CardContent>

        </Card>

        <Card>

          <CardHeader>

            <CardTitle>Recent activity</CardTitle>

            <CardDescription>Progress updates for this application</CardDescription>

          </CardHeader>

          <CardContent className="space-y-3">

            {timeline.length ? (

              timeline.slice(0, 6).map((event) => (

                <div key={event.id} className="text-sm">

                  <p className="font-medium">{event.title}</p>

                  {event.description ? <p className="text-foreground-secondary">{event.description}</p> : null}

                  <p className="text-foreground-muted">

                    {formatRelative(event.timestamp)}

                    {event.timestamp ? ` · ${formatDate(event.timestamp)}` : null}

                  </p>

                </div>

              ))

            ) : (

              <p className="text-sm text-foreground-muted">Activity will appear as CandidArc works on this role.</p>

            )}

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

