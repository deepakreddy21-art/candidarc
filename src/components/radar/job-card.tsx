"use client";

import Link from "next/link";
import {
  CalendarClock,
  Copy,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  RotateCcw,
  ExternalLink,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatRelative } from "@/lib/utils";
import type { JobClassification, RadarJob, VerificationState, MatchLabel } from "@/types/radar";

const classificationMeta: Record<
  JobClassification,
  { label: string; tone: "accent" | "cyan" | "success" | "warning" | "neutral" | "destructive"; Icon: typeof RefreshCw }
> = {
  NEW: { label: "New", tone: "success", Icon: RefreshCw },
  REPOSTED: { label: "Reposted", tone: "warning", Icon: RotateCcw },
  REFRESHED: { label: "Refreshed", tone: "cyan", Icon: RefreshCw },
  REOPENED: { label: "Reopened", tone: "accent", Icon: RotateCcw },
  DUPLICATE: { label: "Duplicate", tone: "neutral", Icon: Copy },
  POSSIBLE_DUPLICATE: { label: "Possible duplicate", tone: "neutral", Icon: Copy },
  UNCHANGED: { label: "Unchanged", tone: "neutral", Icon: RefreshCw },
  EXPIRED: { label: "Expired", tone: "destructive", Icon: CalendarClock },
  UNKNOWN: { label: "Unknown", tone: "neutral", Icon: CalendarClock },
};

export function JobClassificationBadge({ classification }: { classification: JobClassification }) {
  const meta = classificationMeta[classification];
  return (
    <Badge tone={meta.tone} className="gap-1">
      <meta.Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export type FitCategory = "Strong" | "Good" | "Stretch";

export function fitCategoryFromLabel(label?: MatchLabel | string | null, score?: number): FitCategory | null {
  if (label === "Strong match" || label === "Strong") return "Strong";
  if (label === "Good match" || label === "Good") return "Good";
  if (label === "Stretch opportunity" || label === "Stretch") return "Stretch";
  if (label === "Not recommended") return null;
  if (typeof score === "number") {
    if (score >= 75) return "Strong";
    if (score >= 55) return "Good";
    if (score >= 35) return "Stretch";
  }
  return null;
}

const fitTone: Record<FitCategory, "success" | "accent" | "warning"> = {
  Strong: "success",
  Good: "accent",
  Stretch: "warning",
};

function workplaceLabel(job: RadarJob) {
  if (job.remotePolicy === "remote") return "Remote";
  if (job.remotePolicy === "hybrid") return "Hybrid";
  if (job.remotePolicy === "onsite") return "On-site";
  return null;
}

function verificationShort(job: RadarJob) {
  if (job.verificationState === "VERIFIED_OPEN") return "Verified open";
  if (job.companyDirect) return "Company site";
  if (job.primarySource?.demoData || job.demoData) return "Demo fixture";
  return null;
}

export function JobCard({
  job,
  selected,
  onSelect,
  onSave,
  onTailorResume,
  navigateOnSelect,
}: {
  job: RadarJob;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onSave?: (job: RadarJob) => void;
  onHide?: (job: RadarJob) => void;
  onTailorResume?: (job: RadarJob) => void;
  dense?: boolean;
  navigateOnSelect?: boolean;
}) {
  const fit = fitCategoryFromLabel(job.matchLabel, job.matchScore);
  const reasons = (job.matchReasons ?? job.matchBreakdown?.notes ?? []).filter(Boolean).slice(0, 2);
  const workplace = workplaceLabel(job);
  const verification = verificationShort(job);
  const freshness = job.firstSeenAt || job.originalPostedAt || job.sourcePostedAt;

  return (
    <article
      data-testid="job-row"
      className={cn(
        "border-b border-border px-3 py-3 transition-colors sm:px-4",
        selected ? "bg-surface-2" : "hover:bg-surface-2/60",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => {
            if (navigateOnSelect) return;
            onSelect?.(job.id);
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {fit ? (
              <Badge tone={fitTone[fit]} className="rounded-md px-1.5 py-0 text-[11px]">
                {fit}
              </Badge>
            ) : null}
            {verification ? <span className="text-[11px] text-foreground-muted">{verification}</span> : null}
            {freshness ? <span className="text-[11px] text-foreground-muted">{formatRelative(freshness)}</span> : null}
          </div>
          <h3 className="mt-1 text-[15px] font-semibold text-foreground">
            {navigateOnSelect ? (
              <Link href={`/app/radar/jobs/${job.id}`} className="hover:text-accent">
                {job.title}
              </Link>
            ) : (
              job.title
            )}
          </h3>
          <p className="text-sm text-foreground-secondary">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
            {workplace ? ` · ${workplace}` : ""}
            {job.compensation ? ` · ${job.compensation}` : ""}
          </p>
          {reasons.length ? (
            <ul className="mt-1.5 space-y-0.5">
              {reasons.map((reason) => (
                <li key={reason} className="text-xs text-foreground-muted">
                  {reason}
                </li>
              ))}
            </ul>
          ) : null}
        </button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {onSave ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={job.saved ? "Unsave job" : "Save job"}
              onClick={() => onSave(job)}
            >
              {job.saved ? <BookmarkCheck className="h-4 w-4 text-accent" /> : <Bookmark className="h-4 w-4" />}
            </Button>
          ) : null}
          {onTailorResume ? (
            <Button type="button" size="sm" onClick={() => onTailorResume(job)}>
              <FileText className="h-3.5 w-3.5" />
              Tailor
            </Button>
          ) : (
            <Link
              href={`/app/radar/jobs/${job.id}`}
              className="inline-flex h-8 items-center rounded-md px-2 text-xs font-medium text-accent hover:underline"
            >
              View job
            </Link>
          )}
          {job.applicationUrl || job.companyCareersUrl ? (
            <a
              href={job.applicationUrl || job.companyCareersUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground"
            >
              Company site <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function verificationLabel(state: VerificationState) {
  switch (state) {
    case "VERIFIED_OPEN":
      return "Verified open";
    case "LIKELY_OPEN":
      return "Likely open";
    case "STALE":
      return "Verification stale";
    case "LIKELY_CLOSED":
      return "Likely closed";
    case "CLOSED":
      return "Closed";
    case "VERIFICATION_FAILED":
      return "Verification failed";
  }
}
