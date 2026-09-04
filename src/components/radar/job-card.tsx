"use client";

import Link from "next/link";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  Copy,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/feedback";
import { cn, formatRelative } from "@/lib/utils";
import type { JobClassification, RadarJob, VerificationState } from "@/types/radar";

const classificationMeta: Record<
  JobClassification,
  { label: string; tone: "accent" | "cyan" | "success" | "warning" | "neutral" | "destructive"; Icon: typeof Sparkles }
> = {
  NEW: { label: "New", tone: "success", Icon: Sparkles },
  REPOSTED: { label: "Reposted", tone: "warning", Icon: RotateCcw },
  REFRESHED: { label: "Refreshed", tone: "cyan", Icon: RefreshCw },
  REOPENED: { label: "Reopened", tone: "accent", Icon: RotateCcw },
  DUPLICATE: { label: "Duplicate", tone: "neutral", Icon: Copy },
  POSSIBLE_DUPLICATE: { label: "Possible duplicate", tone: "neutral", Icon: Copy },
  UNCHANGED: { label: "Unchanged", tone: "neutral", Icon: RefreshCw },
  EXPIRED: { label: "Expired", tone: "destructive", Icon: CalendarClock },
  UNKNOWN: { label: "Unknown", tone: "neutral", Icon: CalendarClock },
};

function verificationLabel(state: VerificationState) {
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

export function JobClassificationBadge({ classification }: { classification: JobClassification }) {
  const meta = classificationMeta[classification];
  return (
    <Badge tone={meta.tone} className="gap-1">
      <meta.Icon className="h-3 w-3" aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function JobCard({
  job,
  selected,
  onSelect,
  onSave,
  onHide,
  dense,
}: {
  job: RadarJob;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onSave?: (job: RadarJob) => void;
  onHide?: (job: RadarJob) => void;
  dense?: boolean;
}) {
  const meta = classificationMeta[job.classification];

  return (
    <Card
      interactive
      className={cn(
        "overflow-hidden",
        selected && "border-[color-mix(in_oklab,var(--accent)_45%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--accent)_30%,transparent)]",
      )}
    >
      <CardContent className={cn("p-4", !dense && "sm:p-5")}>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold tracking-wide">
            {job.companyMark}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                className="min-w-0 text-left"
                onClick={() => onSelect?.(job.id)}
              >
                <p className="text-[15px] font-semibold hover:text-accent">{job.company}</p>
                <p className="text-sm text-foreground-secondary">{job.title}</p>
              </button>
              <div className="flex shrink-0 gap-1">
                {onSave ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={job.saved ? "Unsave job" : "Save job"}
                    onClick={() => onSave(job)}
                  >
                    {job.saved ? <BookmarkCheck className="h-4 w-4 text-accent" /> : <Bookmark className="h-4 w-4" />}
                  </Button>
                ) : null}
                {onHide ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Hide job"
                    onClick={() => onHide(job)}
                  >
                    <EyeOff className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              <span>{job.location}</span>
              <span>·</span>
              <span className="capitalize">{job.remotePolicy}</span>
              <span>·</span>
              <span>{job.employmentType}</span>
              {job.compensation ? (
                <>
                  <span>·</span>
                  <span>{job.compensation}</span>
                </>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <JobClassificationBadge classification={job.classification} />
              {job.companyDirect ? (
                <Badge tone="accent" className="gap-1">
                  <Building2 className="h-3 w-3" aria-hidden />
                  Company direct
                </Badge>
              ) : null}
              {job.timestampEstimated ? (
                <Badge tone="warning" className="gap-1">
                  <CalendarClock className="h-3 w-3" aria-hidden />
                  Estimated
                </Badge>
              ) : null}
              {(job.verificationState === "VERIFIED_OPEN" ||
                job.verificationState === "LIKELY_OPEN") && (
                <Badge tone="success" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  {verificationLabel(job.verificationState)}
                </Badge>
              )}
              {job.possibleDuplicate || job.classification === "POSSIBLE_DUPLICATE" ? (
                <Badge tone="neutral" className="gap-1">
                  <Copy className="h-3 w-3" aria-hidden />
                  Possible duplicate
                </Badge>
              ) : null}
              {job.demoData || job.primarySource.demoData ? (
                <Badge tone="neutral">Demo fixture</Badge>
              ) : null}
            </div>

            <div className="mt-3 space-y-1 text-xs text-foreground-secondary">
              {job.classification === "REPOSTED" && job.repostedAt ? (
                <p>
                  {meta.label} on {job.sightings.find((s) => s.demoData)?.sourceName ?? "board"}{" "}
                  {formatRelative(job.repostedAt)}
                  {job.sightings.some((s) => s.demoData) ? " (demo fixture)" : ""}
                </p>
              ) : null}
              {job.originalPostedAt ? (
                <p>
                  Originally{" "}
                  {job.originalPostedPrecision === "DATE_ONLY" ||
                  job.originalPostedPrecision === "RELATIVE_DAYS"
                    ? `posted ~${formatRelative(job.originalPostedAt).replace(" ago", "")} ago`
                    : `posted ${formatRelative(job.originalPostedAt)}`}
                </p>
              ) : (
                <p>Original posting date unavailable</p>
              )}
              {job.lastVerifiedAt ? (
                <p>
                  {verificationLabel(job.verificationState)} on {job.primarySource.name}{" "}
                  {formatRelative(job.lastVerifiedAt)}
                </p>
              ) : null}
              <p>Discovered {formatRelative(job.firstSeenAt)}</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] text-foreground-muted">Profile match</p>
                <p className="text-sm font-semibold tabular-nums">{job.matchScore}%</p>
              </div>
              <div>
                <p className="text-[11px] text-foreground-muted">Evidence coverage</p>
                <ProgressBar value={job.evidenceCoverage} className="mt-1.5" tone="cyan" />
              </div>
            </div>

            {job.technologies.length ? (
              <p className="mt-3 truncate text-xs text-foreground-muted">
                {job.technologies.slice(0, 5).join(" · ")}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={`/app/radar/jobs/${job.id}`}
                className="text-sm font-medium text-accent hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Open details
              </Link>
              <span className="text-foreground-muted">·</span>
              <span className="text-xs text-foreground-muted">{job.primarySource.name}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
