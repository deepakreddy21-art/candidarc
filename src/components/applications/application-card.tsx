"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/layout/page-header";
import { ProgressBar } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatRelative } from "@/lib/utils";
import type { Application } from "@/types/domain";

export function ApplicationCard({
  application,
  selected,
  onSelect,
  onArchive,
}: {
  application: Application;
  selected?: boolean;
  onSelect?: (id: string, checked: boolean) => void;
  onArchive?: (id: string) => void;
}) {
  return (
    <Card interactive className="relative overflow-hidden">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          {onSelect ? (
            <input
              type="checkbox"
              className="mt-1.5 h-4 w-4 rounded border-border-strong"
              checked={!!selected}
              onChange={(e) => onSelect(application.id, e.target.checked)}
              aria-label={`Select ${application.company}`}
            />
          ) : null}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold tracking-wide">
            {application.companyMark}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`/app/opportunities/${application.id}`}
                  className="text-[15px] font-semibold hover:text-accent"
                >
                  {application.company}
                </Link>
                <p className="text-sm text-foreground-secondary">{application.role}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="Application actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/app/opportunities/${application.id}`}>Open workspace</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/app/opportunities/${application.id}/resume`}>Open resume</Link>
                  </DropdownMenuItem>
                  {onArchive ? (
                    <DropdownMenuItem onClick={() => onArchive(application.id)}>Archive</DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <span>{application.location}</span>
              <span>·</span>
              <span>{application.employmentType}</span>
              {application.deadline ? (
                <>
                  <span>·</span>
                  <span>Due {formatDate(application.deadline)}</span>
                </>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={application.status} />
              <StatusBadge status={application.stage} />
              <StatusBadge status={application.interviewStatus} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric label="Score" value={application.resumeScore ? `${application.resumeScore}` : "—"} />
              <div>
                <p className="text-[11px] text-foreground-muted">Coverage</p>
                <ProgressBar value={application.evidenceCoverage} className="mt-1" tone="cyan" />
              </div>
              <Metric label="Updated" value={formatRelative(application.updatedAt)} />
            </div>
            <p className="mt-3 text-xs text-foreground-secondary">
              Next: <span className="font-medium text-foreground">{application.nextAction}</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-foreground-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function ApplicationBoardColumn({
  title,
  applications,
  onArchive,
}: {
  title: string;
  applications: Application[];
  onArchive?: (id: string) => void;
}) {
  return (
    <div className="min-w-[280px] flex-1">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-foreground-muted">{applications.length}</span>
      </div>
      <div className="flex flex-col gap-3">
        {applications.map((app) => (
          <ApplicationCard key={app.id} application={app} onArchive={onArchive} />
        ))}
      </div>
    </div>
  );
}

