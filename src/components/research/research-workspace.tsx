"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, CircleDashed, ExternalLink, RefreshCw, Shield } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar, Skeleton } from "@/components/ui/feedback";
import { SectionHeader, StatusBadge } from "@/components/layout/page-header";
import { Switch, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/services/api";
import { cn, formatDate } from "@/lib/utils";
import type {
  Confidence,
  EvidenceRoleMatrixRow,
  ResearchFinding,
  ResearchSource,
  TechnologySignal,
  VerificationStatus,
} from "@/types/domain";

const RESEARCH_TABS = [
  { id: "role", label: "Role" },
  { id: "company", label: "Company" },
  { id: "team", label: "Team" },
  { id: "project", label: "Projects" },
  { id: "technology", label: "Technology" },
  { id: "hiring-signal", label: "Hiring signals" },
  { id: "sources", label: "Sources" },
] as const;

const PROGRESS_STAGES = [
  { id: "intake", label: "JD intake" },
  { id: "company", label: "Company scan" },
  { id: "team", label: "Team signals" },
  { id: "stack", label: "Stack mapping" },
  { id: "matrix", label: "Evidence matrix" },
  { id: "ready", label: "Strategy ready" },
] as const;

export function ResearchWorkspace({
  applicationId,
  className,
}: {
  applicationId: string;
  className?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [findings, setFindings] = useState<ResearchFinding[]>([]);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [technologies, setTechnologies] = useState<TechnologySignal[]>([]);
  const [matrix, setMatrix] = useState<EvidenceRoleMatrixRow[]>([]);
  const [tab, setTab] = useState<string>("role");

  async function load() {
    setLoading(true);
    try {
      const data = await api.listResearch(applicationId);
      setFindings(data.findings);
      setSources(data.sources);
      setTechnologies(data.technologies);
      setMatrix(data.matrix);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  const confidenceAvg = useMemo(() => {
    if (!findings.length) return 0;
    const score = findings.reduce((sum, f) => sum + confidenceScore(f.confidence), 0);
    return Math.round((score / findings.length) * 100);
  }, [findings]);

  function toggleTech(id: string) {
    setTechnologies((prev) =>
      prev.map((t) => (t.id === id ? { ...t, useInResume: !t.useInResume } : t)),
    );
    toast.success("Technology preference updated");
  }

  function refreshResearch() {
    toast.message("Re-running research", { description: "Refreshing public signals…" });
    void load();
  }

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <SectionHeader
        title="Role research"
        description="Verified and inferred signals that drive resume strategy."
        action={
          <Button type="button" variant="secondary" size="sm" onClick={refreshResearch}>
            <RefreshCw />
            Refresh
          </Button>
        }
      />

      <ResearchProgress current={5} confidence={confidenceAvg} />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          {RESEARCH_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {RESEARCH_TABS.filter((t) => t.id !== "technology" && t.id !== "sources").map((t) => (
          <TabsContent key={t.id} value={t.id} className="space-y-3">
            {findings.filter((f) => f.category === t.id).length === 0 ? (
              <EmptyFindings category={t.label} />
            ) : (
              findings
                .filter((f) => f.category === t.id)
                .map((finding) => <FindingCard key={finding.id} finding={finding} sources={sources} />)
            )}
          </TabsContent>
        ))}

        <TabsContent value="technology">
          <TechnologyStack technologies={technologies} onToggle={toggleTech} />
        </TabsContent>

        <TabsContent value="sources" className="space-y-3">
          {sources.map((source) => (
            <Card key={source.id}>
              <CardContent className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="font-medium">{source.title}</p>
                  <p className="mt-1 text-xs text-foreground-muted">
                    {source.type} · accessed {formatDate(source.accessedAt)}
                  </p>
                </div>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Open
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                </a>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <EvidenceRoleMatrix rows={matrix} />
    </div>
  );
}

function ResearchProgress({ current, confidence }: { current: number; confidence: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Research progress</CardTitle>
            <CardDescription>Pipeline stages for this application</CardDescription>
          </div>
          <ConfidenceBadge confidence={confidence >= 75 ? "high" : confidence >= 50 ? "medium" : "low"} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ProgressBar value={(current / PROGRESS_STAGES.length) * 100} tone="cyan" />
        <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {PROGRESS_STAGES.map((stage, i) => {
            const done = i < current;
            const active = i === current - 1;
            return (
              <li
                key={stage.id}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs",
                  done
                    ? "border-[color-mix(in_oklab,var(--success)_28%,transparent)] bg-[color-mix(in_oklab,var(--success)_8%,transparent)]"
                    : "border-border bg-surface-2 text-foreground-muted",
                  active && "ring-1 ring-accent",
                )}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                ) : (
                  <CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden />
                )}
                <span className={cn(done && "text-foreground")}>{stage.label}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-foreground-secondary">
          Aggregate confidence <span className="font-semibold tabular-nums text-foreground">{confidence}%</span>
        </p>
      </CardContent>
    </Card>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const tone = confidence === "high" ? "success" : confidence === "medium" ? "warning" : "neutral";
  return <Badge tone={tone}>{confidence} confidence</Badge>;
}

function FindingCard({
  finding,
  sources,
}: {
  finding: ResearchFinding;
  sources: ResearchSource[];
}) {
  const linked = sources.filter((s) => finding.sourceIds.includes(s.id));
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-[15px]">{finding.title}</CardTitle>
            <div className="flex flex-wrap gap-1.5">
              <ConfidenceBadge confidence={finding.confidence} />
              <StatusBadge status={finding.status} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground-secondary">{finding.summary}</p>
          {finding.uncertaintyNote ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-foreground-muted">
              <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              {finding.uncertaintyNote}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {linked.map((s) => (
              <Badge key={s.id} tone="cyan">
                {s.title}
              </Badge>
            ))}
            {finding.useInResumeStrategy ? <Badge tone="accent">Used in strategy</Badge> : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function TechnologyStack({
  technologies,
  onToggle,
}: {
  technologies: TechnologySignal[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {technologies.map((tech) => (
        <Card key={tech.id}>
          <CardContent className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 space-y-2">
              <p className="font-medium">{tech.name}</p>
              <div className="flex flex-wrap gap-1.5">
                <VerificationBadge status={tech.status} />
                <ConfidenceBadge confidence={tech.confidence} />
                <Badge tone="neutral">{tech.sourceCount} sources</Badge>
              </div>
              {tech.notes ? <p className="text-xs text-foreground-muted">{tech.notes}</p> : null}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Switch
                id={`tech-${tech.id}`}
                checked={tech.useInResume}
                onCheckedChange={() => onToggle(tech.id)}
                aria-label={`Use ${tech.name} in resume`}
              />
              <label htmlFor={`tech-${tech.id}`} className="text-[10px] text-foreground-muted">
                Use in resume
              </label>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function VerificationBadge({ status }: { status: VerificationStatus }) {
  const tone =
    status === "verified"
      ? "success"
      : status === "inferred"
        ? "warning"
        : status === "disputed"
          ? "destructive"
          : "neutral";
  return <Badge tone={tone}>{status}</Badge>;
}

export function EvidenceRoleMatrix({ rows }: { rows: EvidenceRoleMatrixRow[] }) {
  return (
    <section aria-labelledby="evidence-matrix-heading">
      <SectionHeader
        title="Evidence × role matrix"
        description="How requirements map to vault stories and resume usage."
      />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[640px] text-left text-sm">
          <caption id="evidence-matrix-heading" className="sr-only">
            Evidence role coverage matrix
          </caption>
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-foreground-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Requirement</th>
              <th className="px-4 py-3 font-medium">Importance</th>
              <th className="px-4 py-3 font-medium">Evidence</th>
              <th className="px-4 py-3 font-medium">Strength</th>
              <th className="px-4 py-3 font-medium">Resume</th>
              <th className="px-4 py-3 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{row.requirement}</td>
                <td className="px-4 py-3">
                  <Badge tone={row.importance === "required" ? "accent" : "neutral"}>
                    {row.importance}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-foreground-secondary">{row.evidenceIds.length}</td>
                <td className="px-4 py-3">
                  <ConfidenceBadge confidence={row.evidenceStrength} />
                </td>
                <td className="px-4 py-3">
                  <Badge
                    tone={
                      row.resumeUsage === "used" ? "success" : row.resumeUsage === "partial" ? "warning" : "neutral"
                    }
                  >
                    {row.resumeUsage}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-foreground-muted">{row.coverageGap ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmptyFindings({ category }: { category: string }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-foreground-secondary">
        No {category.toLowerCase()} findings yet. Refresh research or deepen sources.
      </CardContent>
    </Card>
  );
}

function confidenceScore(c: Confidence) {
  return c === "high" ? 0.9 : c === "medium" ? 0.65 : 0.4;
}
