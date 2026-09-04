"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import { StatusBadge } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/services/api";
import type { Application } from "@/types/domain";

export default function OpportunityWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ opportunityId: string }>();
  const pathname = usePathname();
  const opportunityId = params.opportunityId;
  const [app, setApp] = useState<Application>();

  useEffect(() => {
    void api.getApplication(opportunityId).then(setApp);
  }, [opportunityId]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold">
              {app?.companyMark ?? "AP"}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">
                  {app?.company ?? "Application"}
                </h1>
                {app ? <StatusBadge status={app.status} /> : null}
              </div>
              <p className="text-sm text-foreground-secondary">
                {app?.role ?? opportunityId}
                {app?.location ? ` · ${app.location}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/app/resumes/new" className={buttonVariants({ size: "sm" })}>
              New tailored resume
            </Link>
            <Link href="/app/opportunities" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              All applications
            </Link>
          </div>
        </div>

        {pathname !== `/app/opportunities/${opportunityId}` ? (
          <p className="mt-4 text-sm text-foreground-muted">
            This workspace view has moved.{" "}
            <Link href={`/app/opportunities/${opportunityId}`} className="text-accent underline-offset-2 hover:underline">
              Open application overview
            </Link>
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
