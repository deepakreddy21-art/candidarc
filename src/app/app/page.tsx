"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { api } from "@/services/api";
import { greetingForHour } from "@/lib/utils";
import type { Application } from "@/types/domain";

export default function DashboardPage() {
  const [name, setName] = useState("there");
  const [apps, setApps] = useState<Application[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void Promise.all([api.getProfile(), api.listApplications()]).then(([profile, applications]) => {
      setName(profile.preferredName || profile.fullName || "there");
      setApps(applications.filter((app) => !app.archived));
      setLoaded(true);
    });
  }, []);

  const readyApps = apps.filter((app) => app.status === "ready" || app.resumeScore >= 85);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greetingForHour()}, ${name}`}
        description="Paste a job description, let CandidArc research and tailor, then review and download."
        actions={
          <Link href="/app/resumes/new" className={buttonVariants()}>
            Tailor a resume
          </Link>
        }
      />

      {!loaded ? (
        <p className="text-sm text-foreground-muted">Loading your workspace…</p>
      ) : apps.length === 0 ? (
        <EmptyState
          title="Start with your career profile and first role"
          description="Add experience in Career Profile, paste a job description, and CandidArc will research the role and prepare a tailored resume you can refine and download."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/app/settings/profile" className={buttonVariants({ variant: "secondary" })}>
                Set up Career Profile
              </Link>
              <Link href="/app/resumes/new" className={buttonVariants()}>
                Paste a job description
              </Link>
            </div>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionCard title={`${apps.length} active application${apps.length === 1 ? "" : "s"}`} href="/app/opportunities" action="View applications">
            Track progress from research through your downloadable resume package.
          </ActionCard>
          {readyApps.length ? (
            <ActionCard title={`${readyApps.length} ready for review`} href="/app/opportunities" action="Review ready applications">
              {readyApps.slice(0, 2).map((app) => (
                <span key={app.id} className="block">
                  {app.company} · {app.role}
                </span>
              ))}
            </ActionCard>
          ) : (
            <ActionCard title="Resume in progress" href="/app/opportunities" action="Check status">
              CandidArc is researching and tailoring your latest application.
            </ActionCard>
          )}
          <ActionCard title="Find fresh roles" href="/app/radar" action="Open Find Jobs">
            Search employer postings and save roles worth a tailored resume.
          </ActionCard>
          <ActionCard title="Career Profile" href="/app/settings/profile" action="Update profile">
            Keep contact details, headline, and verified experience current before each application.
          </ActionCard>
        </div>
      )}
    </div>
  );
}

function ActionCard({
  title,
  href,
  action,
  children,
}: {
  title: string;
  href: string;
  action: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-sm leading-6 text-foreground-secondary">{children}</div>
        <Link href={href} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          {action}
        </Link>
      </CardContent>
    </Card>
  );
}
