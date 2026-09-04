"use client";

import {
  Briefcase,
  Building2,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchBreakdownPanel } from "@/components/radar/match-breakdown";
import { JobClassificationBadge } from "@/components/radar/job-card";
import { formatRelative } from "@/lib/utils";
import type { RadarJob } from "@/types/radar";

export function JobDetailPanel({
  job,
  onSave,
  onHide,
  onCreateApplication,
  creating,
  compact,
}: {
  job: RadarJob;
  onSave?: () => void;
  onHide?: () => void;
  onCreateApplication?: () => void;
  creating?: boolean;
  compact?: boolean;
}) {
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

          <div className="flex flex-wrap gap-2">
            <Button onClick={onCreateApplication} disabled={creating}>
              <Briefcase className="h-4 w-4" />
              {creating ? "Creating…" : "Build an application for this role"}
            </Button>
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
                  Open listing
                </a>
              </Button>
            ) : null}
          </div>
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
