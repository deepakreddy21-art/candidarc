"use client";

import {
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchBreakdownPanel } from "@/components/radar/match-breakdown";
import { JobClassificationBadge } from "@/components/radar/job-card";
import { formatRelative } from "@/lib/utils";
import type { RadarJob, MatchLabel, RadarHistoryEvent } from "@/types/radar";

/** Match label badge colors */
const matchLabelMeta: Record<MatchLabel, { tone: "success" | "accent" | "warning" | "neutral" }> = {
  "Strong match": { tone: "success" },
  "Good match": { tone: "accent" },
  "Stretch opportunity": { tone: "warning" },
  "Not recommended": { tone: "neutral" },
};

export function JobDetailPanel({
  job,
  history,
  brief,
  onSave,
  onHide,
  onTailorResume,
  tailoring,
  compact,
}: {
  job: RadarJob;
  history?: RadarHistoryEvent[];
  brief?: {
    summary: string;
    companyOverview?: string;
    roleHighlights: string[];
    skillsAlignment: string[];
    concerns: string[];
    resumeReadinessLabel: "ready" | "needs_work" | "significant_gaps";
  };
  onSave?: () => void;
  onHide?: () => void;
  onTailorResume?: () => void;
  tailoring?: boolean;
  compact?: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const matchLabel = job.matchLabel as MatchLabel | undefined;
  const matchTone = matchLabel ? matchLabelMeta[matchLabel]?.tone ?? "neutral" : "neutral";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-sm font-semibold">
              {job.companyMark}
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-lg">{job.title}</CardTitle>
              <p className="mt-0.5 text-sm text-foreground-secondary">
                {job.company} · {job.location}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <JobClassificationBadge classification={job.classification} />
                {job.companyDirect ? (
                  <Badge tone="accent" className="gap-1">
                    <Building2 className="h-3 w-3" />
                    Company direct
                  </Badge>
                ) : null}
                {job.verificationState === "VERIFIED_OPEN" ? (
                  <Badge tone="success" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Verified open
                  </Badge>
                ) : null}
                {job.demoData || job.primarySource.demoData ? (
                  <Badge tone="neutral">Demo fixture</Badge>
                ) : null}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm text-foreground-secondary sm:grid-cols-2">
            <Meta label="Employment" value={job.employmentType} />
            <Meta label="Remote" value={job.remotePolicy} />
            {job.compensation ? <Meta label="Compensation" value={job.compensation} /> : null}
            {job.seniority ? <Meta label="Seniority" value={job.seniority} /> : null}
            <Meta label="Discovered" value={formatRelative(job.firstSeenAt)} />
            {job.lastVerifiedAt ? (
              <Meta label="Last verified" value={formatRelative(job.lastVerifiedAt)} />
            ) : null}
          </div>

          <p className="text-sm leading-relaxed text-foreground-secondary">{job.description}</p>

          {!compact ? (
            <>
              <Section title="Responsibilities" items={job.responsibilities} />
              <Section title="Requirements" items={job.requirements} />
              <Section title="Preferred" items={job.preferred} />
            </>
          ) : null}

          <div className="rounded-xl border border-border bg-canvas p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
              Freshness
            </p>
            <p className="mt-1.5 text-sm text-foreground-secondary">{job.freshnessExplanation}</p>
            {job.repostExplanation ? (
              <p className="mt-3 text-sm text-foreground-secondary">{job.repostExplanation}</p>
            ) : null}
          </div>

          {job.primarySource.attribution || job.sightings.some((s) => s.demoData) ? (
            <p className="text-xs text-foreground-muted">
              {job.primarySource.attribution ??
                job.sightings.find((s) => s.attribution)?.attribution}
            </p>
          ) : null}

          {/* Match label section */}
          {matchLabel && (
            <div className="rounded-xl border border-border bg-canvas p-3">
              <div className="flex items-center gap-2">
                <Badge tone={matchTone} className="text-sm">
                  {matchLabel}
                </Badge>
              </div>
              {job.matchReasons && job.matchReasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-foreground-secondary">
                  {job.matchReasons.map((reason, i) => (
                    <li key={i}>• {reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Opportunity Brief section (lazy loaded) */}
          {brief && (
            <div className="rounded-xl border border-border bg-canvas p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                Opportunity Brief
              </p>
              <p className="text-sm text-foreground-secondary">{brief.summary}</p>
              {brief.companyOverview && (
                <p className="text-sm text-foreground-muted">{brief.companyOverview}</p>
              )}
              {brief.roleHighlights.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground-muted">Highlights</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-foreground-secondary">
                    {brief.roleHighlights.map((h, i) => (
                      <li key={i}>• {h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.skillsAlignment.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-foreground-muted">Skills Alignment</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-foreground-secondary">
                    {brief.skillsAlignment.map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {brief.concerns.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-warning">Concerns</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-foreground-muted">
                    {brief.concerns.map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Badge
                tone={
                  brief.resumeReadinessLabel === "ready"
                    ? "success"
                    : brief.resumeReadinessLabel === "needs_work"
                      ? "warning"
                      : "neutral"
                }
              >
                Resume readiness: {brief.resumeReadinessLabel.replace("_", " ")}
              </Badge>
            </div>
          )}

          {/* Posting History (collapsed by default) */}
          {history && history.length > 0 && (
            <div className="rounded-xl border border-border bg-canvas p-3">
              <button
                type="button"
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-foreground-muted"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <span>Posting History ({history.length})</span>
                {historyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {historyOpen && (
                <ul className="mt-3 space-y-2 text-sm">
                  {history.map((event) => (
                    <li key={event.id} className="flex gap-2">
                      <span className="text-foreground-muted shrink-0">
                        {formatRelative(event.at)}
                      </span>
                      <span className="text-foreground-secondary">{event.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {onTailorResume && (
              <Button onClick={onTailorResume} disabled={tailoring}>
                <FileText className="h-4 w-4" />
                {tailoring ? "Creating…" : "Tailor resume"}
              </Button>
            )}
            {onSave ? (
              <Button variant="secondary" onClick={onSave}>
                {job.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {job.saved ? "Saved" : "Save"}
              </Button>
            ) : null}
            {onHide ? (
              <Button variant="ghost" onClick={onHide}>
                <EyeOff className="h-4 w-4" />
                Hide
              </Button>
            ) : null}
            {job.applicationUrl ? (
              <Button variant="outline" asChild>
                <a href={job.applicationUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Open official listing
                </a>
              </Button>
            ) : null}
          </div>

          {/* Third-party source warning */}
          {!job.companyDirect && job.primarySource && (
            <p className="text-xs text-foreground-muted">
              ⚠️ This listing is from {job.primarySource.name}, a third-party source.
              Verify on the company&apos;s official careers page before applying.
            </p>
          )}
        </CardContent>
      </Card>

      <MatchBreakdownPanel breakdown={job.matchBreakdown} evidenceCoverage={job.evidenceCoverage} />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-foreground-muted">{label}</p>
      <p className="capitalize">{value}</p>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-foreground-secondary">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
