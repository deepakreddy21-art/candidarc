"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fitCategoryFromLabel, JobClassificationBadge } from "@/components/radar/job-card";
import { buildTeamSignals, type TeamSignal } from "@/lib/team-signals";
import { decideTechnologyClaim } from "@/lib/resume-evidence-policy";
import { formatRelative } from "@/lib/utils";
import type { MatchLabel, RadarHistoryEvent, RadarJob } from "@/types/radar";

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
  const fit = fitCategoryFromLabel(job.matchLabel as MatchLabel | undefined, job.matchScore);
  const reasons = (job.matchReasons ?? job.matchBreakdown?.notes ?? []).filter(Boolean);
  const signals = useMemo(() => buildTeamSignals(job), [job]);
  const strategies = useMemo(
    () =>
      signals.slice(0, 8).map((signal) =>
        decideTechnologyClaim({
          technology: signal.name,
          hasExactEvidence: Boolean(brief?.skillsAlignment?.some((s) => s.toLowerCase().includes(signal.name.toLowerCase()))),
          hasTransferableEvidence: (job.matchBreakdown?.skills ?? 0) >= 40,
          publicOrOpenSource: !signal.inferred || signal.confidence !== "low",
          proprietary: /internal|proprietary/i.test(signal.name),
        }),
      ),
    [brief?.skillsAlignment, job.matchBreakdown?.skills, signals],
  );
  const gaps = [
    ...(brief?.concerns ?? []),
    ...strategies.filter((s) => s.interviewGap).map((s) => s.rationale),
  ].slice(0, 5);

  const applyUrl = job.applicationUrl || job.companyCareersUrl;

  return (
    <div className="space-y-6 border border-border bg-background p-4 sm:p-5" data-testid="job-detail">
      <header className="space-y-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">{job.title}</h2>
            <p className="mt-1 text-sm text-foreground-secondary">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
              {job.remotePolicy ? ` · ${job.remotePolicy}` : ""}
              {job.compensation ? ` · ${job.compensation}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {fit ? <Badge tone={fit === "Strong" ? "success" : fit === "Good" ? "accent" : "warning"}>{fit}</Badge> : null}
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
              {job.demoData || job.primarySource.demoData ? <Badge tone="neutral">Demo fixture</Badge> : null}
            </div>
            <p className="mt-2 text-xs text-foreground-muted">
              {job.primarySource?.name ? `Source: ${job.primarySource.name}` : null}
              {job.firstSeenAt ? ` · Posted/seen ${formatRelative(job.firstSeenAt)}` : null}
              {job.lastVerifiedAt ? ` · Verified ${formatRelative(job.lastVerifiedAt)}` : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onSave ? (
              <Button type="button" size="sm" variant="secondary" onClick={onSave} aria-label={job.saved ? "Unsave" : "Save"}>
                {job.saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                {job.saved ? "Saved" : "Save"}
              </Button>
            ) : null}
            {onTailorResume ? (
              <Button type="button" size="sm" onClick={onTailorResume} disabled={tailoring}>
                <FileText className="h-4 w-4" />
                {tailoring ? "Starting…" : "Tailor my resume"}
              </Button>
            ) : null}
            {applyUrl ? (
              <a
                href={applyUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-sm font-medium hover:bg-surface-2"
              >
                Apply on company site
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <Section title="Why this job fits">
        {fit ? (
          <p className="text-sm text-foreground-secondary">
            Fit category: <strong className="text-foreground">{fit}</strong>
            {job.matchLabel ? ` (${job.matchLabel})` : ""}. Scores stay in the explanation below — the feed prioritizes this honest category.
          </p>
        ) : (
          <p className="text-sm text-foreground-muted">Fit category unavailable for this listing.</p>
        )}
        {reasons.length ? (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Strongest matches</p>
            <ul className="space-y-1 text-sm text-foreground-secondary">
              {reasons.slice(0, 4).map((r) => (
                <li key={r}>• {r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {brief?.skillsAlignment?.length ? (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Transferable experience</p>
            <ul className="space-y-1 text-sm text-foreground-secondary">
              {brief.skillsAlignment.slice(0, 4).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {(brief?.concerns?.length || gaps.length) ? (
          <div className="mt-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Important gaps</p>
            <ul className="space-y-1 text-sm text-foreground-secondary">
              {(brief?.concerns?.length ? brief.concerns : gaps).slice(0, 4).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!compact && job.matchBreakdown ? (
          <details className="mt-3 rounded-md border border-border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Detailed fit factors</summary>
            <ul className="mt-2 grid gap-1 text-foreground-secondary sm:grid-cols-2">
              <li>Skills {job.matchBreakdown.skills}%</li>
              <li>Evidence {job.matchBreakdown.evidence}%</li>
              <li>Experience {job.matchBreakdown.experience}%</li>
              <li>Seniority {job.matchBreakdown.seniority}%</li>
            </ul>
          </details>
        ) : null}
      </Section>

      <Section title="Team signals">
        {signals.length === 0 ? (
          <p className="text-sm text-foreground-muted">No source-backed team signals available yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {signals.map((signal) => (
              <TeamSignalRow key={signal.id} signal={signal} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Resume strategy">
        <p className="text-sm text-foreground-secondary">
          CandidArc decides how to handle each signal automatically — exact evidence stays exact; transferable public tech can appear in Skills without inventing production history; proprietary systems map to your closest real capability.
        </p>
        {strategies.length ? (
          <ul className="mt-3 space-y-2">
            {strategies.slice(0, 6).map((s) => (
              <li key={s.technology} className="border-b border-border pb-2 text-sm last:border-0">
                <p className="font-medium text-foreground">{s.technology}</p>
                <p className="text-foreground-secondary">{s.rationale}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-foreground-muted">Strategy will refine once research completes for this role.</p>
        )}
      </Section>

      <Section title="Company snapshot">
        {brief?.companyOverview || brief?.summary ? (
          <p className="text-sm leading-relaxed text-foreground-secondary">{brief.companyOverview || brief.summary}</p>
        ) : (
          <p className="text-sm leading-relaxed text-foreground-secondary">{job.description}</p>
        )}
        {job.freshnessExplanation ? (
          <p className="mt-2 text-xs text-foreground-muted">{job.freshnessExplanation}</p>
        ) : null}
      </Section>

      <Section title="Interview preparation">
        {gaps.length ? (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Topics to review</p>
              <ul className="mt-1 space-y-1 text-sm text-foreground-secondary">
                {gaps.slice(0, 4).map((g) => (
                  <li key={g}>• {g}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Likely questions</p>
              <ul className="mt-1 space-y-1 text-sm text-foreground-secondary">
                {signals.slice(0, 3).map((s) => (
                  <li key={`q-${s.id}`}>• How have you worked with {s.name} or a close equivalent?</li>
                ))}
              </ul>
            </div>
            {reasons.length ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Transferable stories</p>
                <ul className="mt-1 space-y-1 text-sm text-foreground-secondary">
                  {reasons.slice(0, 3).map((r) => (
                    <li key={`story-${r}`}>• {r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-foreground-muted">Interview prep topics will appear when gaps or team signals are identified.</p>
        )}
      </Section>

      {history?.length ? (
        <details className="rounded-md border border-border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Source history</summary>
          <ul className="mt-2 space-y-2 text-foreground-secondary">
            {history.slice(0, 8).map((event) => (
              <li key={event.id}>
                <span className="font-medium text-foreground">{event.title}</span>
                {event.detail ? ` — ${event.detail}` : ""}
                {event.demoData ? " (demo fixture)" : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {onHide ? (
        <Button type="button" size="sm" variant="ghost" onClick={onHide}>
          Hide this job
        </Button>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function TeamSignalRow({ signal }: { signal: TeamSignal }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-3" data-testid="team-signal">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-foreground">{signal.name}</p>
          <p className="text-sm text-foreground-secondary">{signal.explanation}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-foreground-muted">
            <Badge tone={signal.confidence === "high" ? "success" : signal.confidence === "medium" ? "accent" : "neutral"}>
              {signal.confidence} confidence
            </Badge>
            {signal.inferred ? <Badge tone="warning">Inferred</Badge> : <Badge tone="success">Confirmed</Badge>}
            {signal.sourceTitle ? <span>{signal.sourceTitle}</span> : null}
            {signal.sourceDomain ? <span>{signal.sourceDomain}</span> : null}
            {signal.publishedAt ? <span>{formatRelative(signal.publishedAt)}</span> : null}
          </div>
        </div>
        {signal.sourceUrl ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-accent"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            Source {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : null}
      </div>
      {open && signal.sourceUrl ? (
        <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-accent">
          {signal.sourceUrl}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </li>
  );
}
