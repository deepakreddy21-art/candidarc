"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, MemoryStick, Pencil, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ProgressBar, Skeleton } from "@/components/ui/feedback";
import { Label, Textarea } from "@/components/ui/input";
import { SectionHeader, StatusBadge } from "@/components/layout/page-header";
import { Switch } from "@/components/ui/tabs";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Audit, AuditFinding, FindingSeverity, MistakeMemoryRule } from "@/types/domain";

const SEVERITY_ORDER: FindingSeverity[] = ["critical", "major", "minor", "suggestion"];

export function AuditWorkspace({
  applicationId,
  className,
}: {
  applicationId: string;
  className?: string;
}) {
  const [audits, setAudits] = useState<Audit[]>([]);
  const [memory, setMemory] = useState<MistakeMemoryRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAuditId, setActiveAuditId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AuditFinding | null>(null);
  const [editText, setEditText] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([
        api.listAudits(applicationId),
        api.listMistakeMemory(applicationId),
      ]);
      setAudits(a);
      setMemory(m);
      setActiveAuditId((prev) => prev ?? a.find((x) => x.status === "in-progress")?.id ?? a.at(-1)?.id ?? null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const active = audits.find((a) => a.id === activeAuditId) ?? audits[0];

  const grouped = useMemo(() => {
    const map: Record<FindingSeverity, AuditFinding[]> = {
      critical: [],
      major: [],
      minor: [],
      suggestion: [],
    };
    for (const f of active?.findings ?? []) {
      map[f.severity].push(f);
    }
    return map;
  }, [active]);

  async function updateFinding(id: string, status: AuditFinding["status"], text?: string) {
    const updated = await api.updateFinding(id, status, text);
    setAudits((prev) =>
      prev.map((audit) => ({
        ...audit,
        findings: audit.findings.map((f) => (f.id === id ? updated : f)),
      })),
    );
    toast.success(`Finding ${status}`);
  }

  async function toggleMemory(rule: MistakeMemoryRule) {
    const next = !rule.userOverride;
    const updated = await api.overrideMistakeMemory(rule.id, next);
    setMemory((prev) => prev.map((m) => (m.id === rule.id ? updated : m)));
    toast.message(next ? "Rule overridden for this application" : "Rule re-activated");
  }

  function regenerate() {
    if (!active?.producesVersion) return;
    setRegenerating(true);
    window.setTimeout(() => {
      setRegenerating(false);
      toast.success(`Generated ${active.producesVersion}`, {
        description: `Accepted findings from ${active.reviewsVersion} applied.`,
      });
    }, 900);
  }

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <SectionHeader
        title="Audit workspace"
        description="Sequential HR and engineering reviews with mistake memory."
      />

      <AuditPipeline audits={audits} activeId={active?.id} onSelect={setActiveAuditId} />

      {active ? (
        <Card className="border-border-strong">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>{active.label}</CardTitle>
                <CardDescription className="mt-1">{active.summary}</CardDescription>
              </div>
              <StatusBadge status={active.status} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-canvas px-4 py-3 text-sm">
              <span className="font-medium text-foreground">Version under review</span>
              <Badge tone="warning">{active.reviewsVersion}</Badge>
              <ArrowRight className="h-4 w-4 text-foreground-muted" aria-hidden />
              <span className="font-medium text-foreground">Next version</span>
              <Badge tone="success">{active.producesVersion ?? "—"}</Badge>
              <span className="text-foreground-muted">
                Score {active.scoreBefore}
                {active.scoreAfter != null ? ` → ${active.scoreAfter}` : ""}
              </span>
              <Button
                type="button"
                size="sm"
                className="ml-auto"
                disabled={regenerating || !active.producesVersion}
                onClick={regenerate}
              >
                <RefreshCw className={cn(regenerating && "animate-spin")} />
                {regenerating ? "Regenerating…" : `Generate ${active.producesVersion}`}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {SEVERITY_ORDER.map((severity) =>
              grouped[severity].length ? (
                <div key={severity}>
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize">
                    <StatusBadge status={severity} />
                    {grouped[severity].length} finding{grouped[severity].length === 1 ? "" : "s"}
                  </h3>
                  <div className="space-y-3">
                    {grouped[severity].map((finding) => (
                      <FindingCard
                        key={finding.id}
                        finding={finding}
                        onAccept={() => void updateFinding(finding.id, "accepted")}
                        onReject={() => void updateFinding(finding.id, "rejected")}
                        onEdit={() => {
                          setEditing(finding);
                          setEditText(finding.suggestedText);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </CardContent>
        </Card>
      ) : null}

      <MistakeMemoryPanel rules={memory} onToggle={toggleMemory} />

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit suggestion</DialogTitle>
            <DialogDescription>{editing?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="finding-edit">Suggested text</Label>
              <Textarea
                id="finding-edit"
                rows={5}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (!editing) return;
                  void updateFinding(editing.id, "edited", editText);
                  setEditing(null);
                }}
              >
                Save edit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AuditPipeline({
  audits,
  activeId,
  onSelect,
}: {
  audits: Audit[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Audit pipeline">
      {audits.map((audit, i) => {
        const active = audit.id === activeId;
        return (
          <li key={audit.id}>
            <button
              type="button"
              onClick={() => onSelect(audit.id)}
              className={cn(
                "w-full rounded-xl border bg-surface p-3 text-left transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active ? "border-accent shadow-[var(--shadow-sm)]" : "border-border hover:border-border-strong",
              )}
              aria-current={active ? "step" : undefined}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs text-foreground-muted">Step {i + 1}</span>
                <StatusBadge status={audit.status} />
              </div>
              <p className="text-sm font-semibold">{audit.label}</p>
              <p className="mt-1 text-xs text-foreground-secondary">
                {audit.reviewsVersion}
                {audit.producesVersion ? ` → ${audit.producesVersion}` : ""}
              </p>
              <div className="mt-2">
                <ProgressBar
                  value={
                    audit.status === "completed"
                      ? 100
                      : audit.status === "in-progress"
                        ? 55
                        : 8
                  }
                  tone={audit.lens.startsWith("hr") ? "accent" : "cyan"}
                  className="h-1.5"
                />
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function FindingCard({
  finding,
  onAccept,
  onReject,
  onEdit,
}: {
  finding: AuditFinding;
  onAccept: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{finding.title}</p>
            <p className="mt-0.5 text-xs text-foreground-muted">
              {finding.section} · +{finding.expectedScoreImpact} expected
            </p>
          </div>
          <StatusBadge status={finding.status} />
        </div>
        <p className="text-sm text-foreground-secondary">{finding.explanation}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border bg-canvas p-2.5">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-foreground-muted">Before</p>
            <p className="text-xs text-foreground-secondary">{finding.beforeText}</p>
          </div>
          <div className="rounded-lg border border-[color-mix(in_oklab,var(--success)_25%,transparent)] bg-[color-mix(in_oklab,var(--success)_6%,transparent)] p-2.5">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-success">Suggested</p>
            <p className="text-xs text-foreground">{finding.suggestedText}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={onAccept}>
            <Check />
            Accept
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onEdit}>
            <Pencil />
            Edit
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onReject}>
            <X />
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function MistakeMemoryPanel({
  rules,
  onToggle,
}: {
  rules: MistakeMemoryRule[];
  onToggle: (rule: MistakeMemoryRule) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MemoryStick className="h-4 w-4 text-cyan" aria-hidden />
          <CardTitle className="text-base">Mistake memory</CardTitle>
        </div>
        <CardDescription>
          Rules learned from prior audits so regenerations do not reintroduce the same mistakes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-canvas p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">{rule.rule}</p>
              <p className="mt-1 text-xs text-foreground-muted">
                From {rule.originatingAudit} on {rule.affectedVersion} · applied in {rule.appliedIn.join(", ")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={rule.status} />
              <div className="flex items-center gap-2">
                <Label htmlFor={`mm-${rule.id}`} className="text-xs text-foreground-muted">
                  Override
                </Label>
                <Switch
                  id={`mm-${rule.id}`}
                  checked={!!rule.userOverride}
                  onCheckedChange={() => onToggle(rule)}
                  aria-label={`Override rule: ${rule.rule}`}
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
