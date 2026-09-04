"use client";

import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, List, Lock, Plus, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input, Label, Textarea } from "@/components/ui/input";
import { SectionHeader, StatusBadge } from "@/components/layout/page-header";
import { Switch } from "@/components/ui/tabs";
import { api } from "@/services/api";
import { cn, formatRelative } from "@/lib/utils";
import type { Confidence, EvidenceItem, PrivacyLevel, VerificationStatus } from "@/types/domain";

type ViewMode = "grid" | "list";

const PRIVACY_OPTIONS: PrivacyLevel[] = ["public", "share-safe", "private", "do-not-use"];

export function EvidenceVault({
  applicationId,
  className,
}: {
  applicationId?: string;
  className?: string;
}) {
  void applicationId;
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [privacy, setPrivacy] = useState<PrivacyLevel | "all">("all");
  const [confidence, setConfidence] = useState<Confidence | "all">("all");
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EvidenceItem | null>(null);

  async function load() {
    setLoading(true);
    try {
      setItems(await api.listEvidence());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (privacy !== "all" && item.privacyLevel !== privacy) return false;
      if (confidence !== "all" && item.confidence !== confidence) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.organization.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        item.technologies.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [items, search, privacy, confidence]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(item: EvidenceItem) {
    setEditing(item);
    setFormOpen(true);
    setSelected(null);
  }

  async function handleSave(item: EvidenceItem) {
    const saved = await api.upsertEvidence(item);
    setItems((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setFormOpen(false);
    toast.success(editing ? "Evidence updated" : "Evidence added");
  }

  if (loading) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", className)}>
      <SectionHeader
        title="Evidence vault"
        description="STAR stories, metrics, and privacy controls that ground resume claims."
        action={
          <Button type="button" onClick={openCreate}>
            <Plus />
            Add evidence
          </Button>
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="evidence-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" aria-hidden />
            <Input
              id="evidence-search"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title, org, tech, or tag"
            />
          </div>
        </div>
        <FilterSelect
          id="evidence-privacy"
          label="Privacy"
          value={privacy}
          onChange={(v) => setPrivacy(v as PrivacyLevel | "all")}
          options={[
            { value: "all", label: "All privacy" },
            ...PRIVACY_OPTIONS.map((p) => ({ value: p, label: p.replace(/-/g, " ") })),
          ]}
        />
        <FilterSelect
          id="evidence-confidence"
          label="Confidence"
          value={confidence}
          onChange={(v) => setConfidence(v as Confidence | "all")}
          options={[
            { value: "all", label: "All confidence" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ]}
        />
        <div className="flex gap-1 rounded-[12px] bg-surface-2 p-1" role="group" aria-label="View mode">
          <Button
            type="button"
            size="icon-sm"
            variant={view === "grid" ? "secondary" : "ghost"}
            aria-pressed={view === "grid"}
            aria-label="Grid view"
            onClick={() => setView("grid")}
          >
            <LayoutGrid />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === "list" ? "secondary" : "ghost"}
            aria-pressed={view === "list"}
            aria-label="List view"
            onClick={() => setView("list")}
          >
            <List />
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No matching evidence"
          description="Adjust filters or add a new STAR story to the vault."
          action={
            <Button type="button" onClick={openCreate}>
              <Plus />
              Add evidence
            </Button>
          }
          icon={<Shield className="h-8 w-8" />}
        />
      ) : (
        <div
          className={cn(
            view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "flex flex-col gap-3",
          )}
        >
          {filtered.map((item) => (
            <EvidenceCard
              key={item.id}
              item={item}
              dense={view === "list"}
              onOpen={() => setSelected(item)}
            />
          ))}
        </div>
      )}

      <EvidenceDetailDrawer
        item={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onEdit={openEdit}
        onPrivacyChange={async (level) => {
          if (!selected) return;
          const updated = { ...selected, privacyLevel: level, lastUpdated: new Date().toISOString() };
          await handleSave(updated);
          setSelected(updated);
        }}
      />

      <EvidenceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        onSave={handleSave}
      />
    </div>
  );
}

export function EvidenceCard({
  item,
  onOpen,
  dense,
}: {
  item: EvidenceItem;
  onOpen: () => void;
  dense?: boolean;
}) {
  return (
    <Card interactive className={cn(dense && "flex flex-row items-stretch")}>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          dense ? "flex flex-1 items-center gap-4 p-4" : "",
        )}
        aria-label={`Open evidence: ${item.title}`}
      >
        {!dense ? (
          <>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-[15px] leading-snug">{item.title}</CardTitle>
                <PrivacyIcon level={item.privacyLevel} />
              </div>
              <p className="text-sm text-foreground-secondary">{item.organization}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="line-clamp-2 text-sm text-foreground-muted">{item.result}</p>
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={item.verificationStatus} />
                <Badge tone={item.confidence === "high" ? "success" : "warning"}>{item.confidence}</Badge>
                {item.interviewStoryReady ? <Badge tone="cyan">Interview ready</Badge> : null}
              </div>
              <p className="text-xs text-foreground-muted">Updated {formatRelative(item.lastUpdated)}</p>
            </CardContent>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-foreground-secondary">
                {item.organization} · {item.result}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <StatusBadge status={item.verificationStatus} />
              <PrivacyIcon level={item.privacyLevel} />
            </div>
          </>
        )}
      </button>
    </Card>
  );
}

function EvidenceDetailDrawer({
  item,
  open,
  onOpenChange,
  onEdit,
  onPrivacyChange,
}: {
  item: EvidenceItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (item: EvidenceItem) => void;
  onPrivacyChange: (level: PrivacyLevel) => void;
}) {
  if (!item) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
          <DialogDescription>
            {item.organization} · last updated {formatRelative(item.lastUpdated)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={item.verificationStatus} />
            <Badge tone={item.confidence === "high" ? "success" : "warning"}>{item.confidence}</Badge>
            <Badge tone="neutral">{item.privacyLevel.replace(/-/g, " ")}</Badge>
          </div>

          <StarBlock label="Situation" text={item.situation} />
          <StarBlock label="Task" text={item.task} />
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">Actions</p>
            <ul className="list-disc space-y-1 pl-5 text-foreground-secondary">
              {item.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>
          <StarBlock label="Result" text={item.result} />

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-foreground-muted">Metrics</p>
            <div className="flex flex-wrap gap-2">
              {item.metrics.map((m) => (
                <Badge key={m.id} tone={m.verified ? "success" : "neutral"}>
                  {m.label}: {m.value}
                  {m.unit ?? ""}
                  {m.baseline ? ` (from ${m.baseline})` : ""}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {item.technologies.map((t) => (
              <Badge key={t} tone="cyan">
                {t}
              </Badge>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-canvas p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Lock className="h-4 w-4 text-foreground-muted" aria-hidden />
              Privacy control
            </p>
            <div className="flex flex-wrap gap-2">
              {PRIVACY_OPTIONS.map((level) => (
                <Button
                  key={level}
                  type="button"
                  size="sm"
                  variant={item.privacyLevel === level ? "default" : "secondary"}
                  onClick={() => onPrivacyChange(level)}
                >
                  {level.replace(/-/g, " ")}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onEdit(item)}>
              Edit
            </Button>
            <Button
              type="button"
              onClick={() => {
                toast.success("Marked interview-ready");
              }}
            >
              Mark interview-ready
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EvidenceFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: EvidenceItem | null;
  onSave: (item: EvidenceItem) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [situation, setSituation] = useState("");
  const [task, setTask] = useState("");
  const [actions, setActions] = useState("");
  const [result, setResult] = useState("");
  const [technologies, setTechnologies] = useState("");
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>("share-safe");
  const [interviewReady, setInterviewReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setOrganization(initial?.organization ?? "");
    setSituation(initial?.situation ?? "");
    setTask(initial?.task ?? "");
    setActions(initial?.actions.join("\n") ?? "");
    setResult(initial?.result ?? "");
    setTechnologies(initial?.technologies.join(", ") ?? "");
    setPrivacyLevel(initial?.privacyLevel ?? "share-safe");
    setInterviewReady(initial?.interviewStoryReady ?? false);
  }, [open, initial]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !organization.trim()) {
      toast.error("Title and organization are required");
      return;
    }
    setSaving(true);
    try {
      const base: EvidenceItem = initial ?? {
        id: `ev-${Date.now()}`,
        title: "",
        organization: "",
        situation: "",
        task: "",
        actions: [],
        result: "",
        metrics: [],
        technologies: [],
        roleRelevance: [],
        confidence: "medium",
        verificationStatus: "unverified" as VerificationStatus,
        privacyLevel: "share-safe",
        lastUpdated: new Date().toISOString(),
        resumeUsageHistory: [],
        interviewStoryReady: false,
        tags: [],
      };
      await onSave({
        ...base,
        title: title.trim(),
        organization: organization.trim(),
        situation: situation.trim(),
        task: task.trim(),
        actions: actions
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean),
        result: result.trim(),
        technologies: technologies
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        privacyLevel,
        interviewStoryReady: interviewReady,
        lastUpdated: new Date().toISOString(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit evidence" : "Add evidence"}</DialogTitle>
          <DialogDescription>Capture a STAR story with privacy defaults.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Title" id="ev-title">
            <Input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Organization" id="ev-org">
            <Input id="ev-org" value={organization} onChange={(e) => setOrganization(e.target.value)} required />
          </Field>
          <Field label="Situation" id="ev-sit">
            <Textarea id="ev-sit" value={situation} onChange={(e) => setSituation(e.target.value)} rows={2} />
          </Field>
          <Field label="Task" id="ev-task">
            <Textarea id="ev-task" value={task} onChange={(e) => setTask(e.target.value)} rows={2} />
          </Field>
          <Field label="Actions (one per line)" id="ev-actions">
            <Textarea id="ev-actions" value={actions} onChange={(e) => setActions(e.target.value)} rows={3} />
          </Field>
          <Field label="Result" id="ev-result">
            <Textarea id="ev-result" value={result} onChange={(e) => setResult(e.target.value)} rows={2} />
          </Field>
          <Field label="Technologies (comma-separated)" id="ev-tech">
            <Input id="ev-tech" value={technologies} onChange={(e) => setTechnologies(e.target.value)} />
          </Field>
          <Field label="Privacy" id="ev-privacy">
            <select
              id="ev-privacy"
              className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
              value={privacyLevel}
              onChange={(e) => setPrivacyLevel(e.target.value as PrivacyLevel)}
            >
              {PRIVACY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p.replace(/-/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-center justify-between rounded-xl border border-border bg-canvas px-3 py-2">
            <Label htmlFor="ev-interview">Interview story ready</Label>
            <Switch id="ev-interview" checked={interviewReady} onCheckedChange={setInterviewReady} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save evidence"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PrivacyIcon({ level }: { level: PrivacyLevel }) {
  const title = level.replace(/-/g, " ");
  return (
    <span title={title} className="text-foreground-muted" aria-label={`Privacy: ${title}`}>
      <Lock className="h-4 w-4" />
    </span>
  );
}

function StarBlock({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</p>
      <p className="text-foreground-secondary">{text}</p>
    </div>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="w-full space-y-1.5 sm:w-40">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
