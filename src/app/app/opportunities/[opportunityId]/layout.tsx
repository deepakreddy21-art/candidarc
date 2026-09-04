"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { applications } from "@/data/seed";
import { StatusBadge } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const subnav = [
  { segment: "", label: "Overview" },
  { segment: "research", label: "Research" },
  { segment: "evidence", label: "Evidence" },
  { segment: "resume", label: "Resume" },
  { segment: "audits", label: "Audits" },
  { segment: "application", label: "Application" },
  { segment: "activity", label: "Activity" },
];

export default function OpportunityWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ opportunityId: string }>();
  const pathname = usePathname();
  const opportunityId = params.opportunityId;
  const app = applications.find((a) => a.id === opportunityId);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold">
              {app?.companyMark ?? "OP"}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-[24px] font-semibold tracking-tight sm:text-[28px]">
                  {app?.company ?? "Opportunity"}
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
            <Link href={`/app/opportunities/${opportunityId}/resume`} className={buttonVariants({ size: "sm" })}>
              Open resume
            </Link>
            <Link
              href={`/app/opportunities/${opportunityId}/application`}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Application Copilot
            </Link>
          </div>
        </div>

        <nav
          className="mt-4 -mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:hidden"
          aria-label="Opportunity sections"
        >
          {subnav.map((item) => {
            const href =
              item.segment === ""
                ? `/app/opportunities/${opportunityId}`
                : `/app/opportunities/${opportunityId}/${item.segment}`;
            const active = item.segment === "" ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={item.label}
                href={href}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-sm",
                  active ? "bg-accent text-white" : "bg-surface-2 text-foreground-secondary",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
