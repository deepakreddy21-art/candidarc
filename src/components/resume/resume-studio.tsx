"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Columns2, GitCompare, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar, ScoreRing, Skeleton } from "@/components/ui/feedback";
import { SectionHeader, StatusBadge } from "@/components/layout/page-header";
import { candidate } from "@/data/seed";
import { api } from "@/services/api";
import { cn, formatDate } from "@/lib/utils";
import type {
  AuditFinding,
  FinalQACheck,
  Resume,
  ResumeBullet,
  ResumeScoreBreakdown,
  ResumeVersion,
} from "@/types/domain";

export function ResumeStudio({
  applicationId,
  className,
}: {
  applicationId: string;
  className?: string;
}) {
  const [resume, setResume] = useState<Resume | null>(null);
  const [auditsLoading, setAuditsLoading] = useState(true);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [qa, setQa] = useState<FinalQACheck[]>([]);
  const [selectedBulletId, setSelectedBulletId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  async function load() {
    setAuditsLoading(true);
    try {
      const [r, audits, checks] = await Promise.all([
        api.getResume(applicationId),
        api.listAudits(applicationId),
        api.getFinalQA(),
      ]);
      setResume(r ?? null);
      setFindings(audits.flatMap((a) => a.findings));
      setQa(checks);
      if (r && !compareVersionId) {
        const prior = r.versions.find((v) => v.id !== r.currentVersionId);
        setCompareVersionId(prior?.id ?? r.versions[0]?.id ?? null);
      }
    } finally {
      setAuditsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const current = useMemo(
    () => resume?.versions.find((v) => v.id === resume.currentVersionId) ?? resume?.versions.at(-1),
    [resume],
  );
  const compare = useMemo(
    () => resume?.versions.find((v) => v.id === compareVersionId),
    [resume, compareVersionId],
  );

  const bulletFindings = useMemo(() => {
    const map = new Map<string, AuditFinding[]>();
    for (const f of findings) {
      if (!f.bulletId) continue;
      const list = map.get(f.bulletId) ?? [];
      list.push(f);
      map.set(f.bulletId, list);
    }
    return map;
  }, [findings]);

  const openIssues = findings.filter((f) => f.status === "open" || f.status === "deferred");

  async function switchVersion(versionId: string) {
    if (!resume) return;
    const updated = await api.setResumeVersion(applicationId, versionId);
    setResume(updated);
    toast.success(`Switched to ${updated.versions.find((v) => v.id === versionId)?.versionLabel}`);
  }

  async function resolveFinding(findingId: string, status: AuditFinding["status"]) {
    const updated = await api.updateFinding(findingId, status);
    setFindings((prev) => prev.map((f) => (f.id === findingId ? updated : f)));
    toast.success(`Finding ${status}`);
  }

  if (auditsLoading || !resume || !current) {
    return (
      <div className={cn("grid gap-4 lg:grid-cols-[240px_1fr_280px]", className)}>
        <Skeleton className="h-[70vh]" />
        <Skeleton className="h-[70vh]" />
        <Skeleton className="h-[70vh]" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SectionHeader
          title="Resume studio"
          description={`${resume.title} · score path 68 → 91`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="resume-version" className="sr-only">
            Resume version
          </label>
          <select
            id="resume-version"
            className="h-10 rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
            value={resume.currentVersionId}
            onChange={(e) => void switchVersion(e.target.value)}
          >
            {resume.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.versionLabel} · {v.score}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant={compareMode ? "default" : "secondary"}
            size="sm"
            onClick={() => setCompareMode((c) => !c)}
            aria-pressed={compareMode}
          >
            <GitCompare />
            Compare
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_300px]">
        {/* Left: outline + issues */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Outline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {current.sections
                .slice()
                .sort((a, b) => a.order - b.order)
                .map((section) => (
                  <div key={section.id}>
                    <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
                      {section.title}
                    </p>
                    {section.items?.map((item) =>
                      item.bullets.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBulletId(b.id)}
                          className={cn(
                            "block w-full truncate rounded-[10px] px-2 py-1.5 text-left text-xs text-foreground-secondary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring",
                            selectedBulletId === b.id && "bg-surface-2 font-medium text-foreground",
                          )}
                        >
                          {b.text.slice(0, 48)}…
                        </button>
                      )),
                    )}
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Open issues ({openIssues.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {openIssues.length === 0 ? (
                <p className="text-xs text-foreground-muted">No open issues on linked audits.</p>
              ) : (
                openIssues.map((issue) => (
                  <IssueMini
                    key={issue.id}
                    finding={issue}
                    onSelect={() => issue.bulletId && setSelectedBulletId(issue.bulletId)}
                    onAccept={() => void resolveFinding(issue.id, "accepted")}
                    onReject={() => void resolveFinding(issue.id, "rejected")}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Center: canvas */}
        <div className={cn("min-w-0", compareMode && "grid gap-3 lg:grid-cols-2")}>
          <ResumeCanvas
            version={current}
            candidateName={candidate.fullName}
            contact={{
              email: candidate.email,
              phone: candidate.phone,
              location: candidate.location,
              links: [candidate.linkedIn, candidate.github, candidate.portfolio].filter(Boolean) as string[],
            }}
            selectedBulletId={selectedBulletId}
            onSelectBullet={setSelectedBulletId}
            highlightedFindingIds={
              selectedBulletId ? (bulletFindings.get(selectedBulletId) ?? []).map((f) => f.id) : []
            }
          />
          {compareMode && compare ? (
            <ResumeCanvas
              version={compare}
              candidateName={candidate.fullName}
              contact={{
                email: candidate.email,
                phone: candidate.phone,
                location: candidate.location,
                links: [candidate.linkedIn, candidate.github, candidate.portfolio].filter(Boolean) as string[],
              }}
              selectedBulletId={null}
              onSelectBullet={() => undefined}
              muted
              label={`Compare ${compare.versionLabel}`}
            />
          ) : null}
        </div>

        {/* Right: score / provenance / QA */}
        <aside className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm">Score</CardTitle>
              <ScoreRing score={current.score} size={64} />
            </CardHeader>
            <CardContent className="space-y-2">
              <ScoreBreakdownBars breakdown={current.scoreBreakdown} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Provenance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-foreground-secondary">
              <p>
                Version <span className="font-medium text-foreground">{current.versionLabel}</span>
              </p>
              <p>Triggered by {current.triggeredBy}</p>
              <p>{formatDate(current.createdAt)}</p>
              <p className="text-foreground-muted">{current.notes}</p>
              {selectedBulletId ? (
                <SelectedBulletProvenance
                  version={current}
                  bulletId={selectedBulletId}
                  findings={bulletFindings.get(selectedBulletId) ?? []}
                />
              ) : null}
            </CardContent>
          </Card>

          <FinalQAChecklist
            checks={qa}
            onToggle={(id) => {
              setQa((prev) =>
                prev.map((c) =>
                  c.id === id
                    ? { ...c, status: c.status === "pass" ? "warning" : "pass" }
                    : c,
                ),
              );
              toast.message("QA checklist updated");
            }}
          />
        </aside>
      </div>
    </div>
  );
}

function IssueMini({
  finding,
  onSelect,
  onAccept,
  onReject,
}: {
  finding: AuditFinding;
  onSelect: () => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-canvas p-2.5">
      <button type="button" onClick={onSelect} className="w-full text-left focus-visible:outline-2 focus-visible:outline-ring">
        <div className="mb-1 flex items-center gap-1.5">
          <StatusBadge status={finding.severity} />
          <StatusBadge status={finding.status} />
        </div>
        <p className="text-xs font-medium">{finding.title}</p>
      </button>
      <div className="mt-2 flex gap-1">
        <Button type="button" size="sm" variant="secondary" className="h-7 px-2 text-xs" onClick={onAccept}>
          <Check className="h-3 w-3" />
          Accept
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onReject}>
          <X className="h-3 w-3" />
          Reject
        </Button>
      </div>
    </div>
  );
}

export function ResumeCanvas({
  version,
  candidateName,
  contact,
  selectedBulletId,
  onSelectBullet,
  highlightedFindingIds = [],
  muted,
  label,
}: {
  version: ResumeVersion;
  candidateName: string;
  contact: { email: string; phone: string; location: string; links: string[] };
  selectedBulletId: string | null;
  onSelectBullet: (id: string) => void;
  highlightedFindingIds?: string[];
  muted?: boolean;
  label?: string;
}) {
  void highlightedFindingIds;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border-strong bg-[#f7f5f0] text-[#1a1a1a] shadow-[var(--shadow-md)]",
        muted && "opacity-90",
      )}
      aria-label={label ?? `Resume ${version.versionLabel}`}
    >
      {label ? (
        <div className="absolute right-3 top-3 z-10 rounded-full border border-black/10 bg-white/90 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-black/70">
          {label}
        </div>
      ) : null}
      <article className="mx-auto max-w-[8.5in] px-8 py-7 font-[Georgia,Cambria,'Times_New_Roman',serif] text-[11.5px] leading-[1.35]">
        <header className="border-b border-black/20 pb-3 text-center">
          <h1 className="text-[20px] font-bold tracking-[0.02em]">{candidateName}</h1>
          <p className="mt-1 text-[10.5px] text-black/70">
            {contact.location} · {contact.email} · {contact.phone}
          </p>
          <p className="mt-0.5 text-[10px] text-black/60">{contact.links.join(" · ")}</p>
        </header>

        {version.sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((section) => (
            <section key={section.id} className="mt-3">
              <h2 className="border-b border-black/15 pb-0.5 text-[11px] font-bold uppercase tracking-[0.12em]">
                {section.title}
              </h2>
              {section.content ? (
                <p className="mt-1.5 text-justify text-[11px]">{section.content}</p>
              ) : null}
              {section.items?.map((item) => (
                <div key={item.id} className="mt-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-bold">
                      {item.heading}
                      {item.subheading ? (
                        <span className="font-normal">
                          {" "}
                          — <em>{item.subheading}</em>
                        </span>
                      ) : null}
                    </p>
                    <p className="shrink-0 text-[10.5px] text-black/65">
                      {[item.location, item.dates].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {item.bullets.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {item.bullets.map((bullet) => (
                        <ResumeBulletLine
                          key={bullet.id}
                          bullet={bullet}
                          selected={selectedBulletId === bullet.id}
                          onSelect={() => onSelectBullet(bullet.id)}
                        />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </section>
          ))}
      </article>
    </div>
  );
}

function ResumeBulletLine({
  bullet,
  selected,
  onSelect,
}: {
  bullet: ResumeBullet;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full rounded-sm px-1 py-0.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0b5fff]",
          selected && "bg-[#dbe8ff] ring-1 ring-[#0b5fff]/40",
          bullet.unsupported && "bg-[#ffe8e4]",
        )}
      >
        <span className="mr-1.5">•</span>
        {bullet.text}
      </button>
    </li>
  );
}

function ScoreBreakdownBars({ breakdown }: { breakdown: ResumeScoreBreakdown }) {
  const entries: Array<[string, number]> = [
    ["ATS", breakdown.atsCompatibility],
    ["Alignment", breakdown.jobAlignment],
    ["Readability", breakdown.recruiterReadability],
    ["Impact", breakdown.impact],
    ["Quant", breakdown.quantification],
    ["Technical", breakdown.technicalDepth],
    ["Coverage", breakdown.competencyCoverage],
    ["Evidence", breakdown.evidenceConfidence],
    ["Writing", breakdown.writingQuality],
    ["Format", breakdown.formatIntegrity],
  ];
  return (
    <div className="space-y-2">
      {entries.map(([label, value]) => (
        <div key={label}>
          <div className="mb-0.5 flex justify-between text-[11px]">
            <span className="text-foreground-secondary">{label}</span>
            <span className="tabular-nums">{value}</span>
          </div>
          <ProgressBar value={value} className="h-1" />
        </div>
      ))}
    </div>
  );
}

function SelectedBulletProvenance({
  version,
  bulletId,
  findings,
}: {
  version: ResumeVersion;
  bulletId: string;
  findings: AuditFinding[];
}) {
  let bullet: ResumeBullet | undefined;
  for (const section of version.sections) {
    for (const item of section.items ?? []) {
      const found = item.bullets.find((b) => b.id === bulletId);
      if (found) bullet = found;
    }
  }
  if (!bullet) return null;
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="font-medium text-foreground">Selected bullet</p>
      <div className="flex flex-wrap gap-1">
        <Badge tone={bullet.confidence === "high" ? "success" : "warning"}>{bullet.confidence}</Badge>
        {bullet.evidenceIds.map((id) => (
          <Badge key={id} tone="cyan">
            {id}
          </Badge>
        ))}
      </div>
      {bullet.metricsUsed?.length ? (
        <p>Metrics: {bullet.metricsUsed.join(", ")}</p>
      ) : null}
      {findings.length ? (
        <p>
          Linked findings: {findings.map((f) => f.title).join("; ")}
        </p>
      ) : (
        <p>No open findings for this bullet.</p>
      )}
    </div>
  );
}

export function FinalQAChecklist({
  checks,
  onToggle,
}: {
  checks: FinalQACheck[];
  onToggle: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Final QA</CardTitle>
          <Columns2 className="h-4 w-4 text-foreground-muted" aria-hidden />
        </div>
      </CardHeader>
      <CardContent className="max-h-64 space-y-1.5 overflow-y-auto">
        {checks.map((check) => (
          <button
            key={check.id}
            type="button"
            onClick={() => onToggle(check.id)}
            className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <StatusBadge status={check.status} />
            <span className="min-w-0">
              <span className="block text-xs font-medium">{check.label}</span>
              <span className="block text-[11px] text-foreground-muted">{check.detail}</span>
            </span>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
