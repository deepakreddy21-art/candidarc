"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { product } from "@/config/product";
import { api, ApiError } from "@/services/api";

const DELETE_DOCS_REASON =
  "Per-document deletion is not available yet. Export your data, or delete the account to remove all uploads.";
const RETENTION_REASON =
  "Automatic retention windows are not available. CandidArc does not currently delete inactive artifacts on a timer. Export or delete the account to remove data.";
const EVIDENCE_VISIBILITY_REASON =
  "Workspace evidence visibility is controlled per STAR item, not by a global account switch. This control is unavailable because it would not change server behavior.";
const MODEL_IMPROVEMENT_COPY =
  "Stored on your account. CandidArc does not currently train models on your content, regardless of this setting. No training pipeline exists to honor an opt-in.";

function csrfToken() {
  const raw =
    document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ??
    document.cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.split("=")[1] ??
    "";
  return decodeURIComponent(raw);
}

export default function PrivacySettingsPage() {
  const [modelImprovement, setModelImprovement] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .getProfile()
      .then((profile) => {
        setModelImprovement(Boolean(profile.modelImprovementOptIn));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function exportData() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/account", { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "candidarc-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch {
      toast.error("Could not export your data");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        credentials: "include",
        headers: { "x-csrf-token": csrfToken() },
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Account deleted");
      window.location.href = "/sign-in";
    } catch {
      toast.error("Could not delete account");
    } finally {
      setBusy(false);
    }
  }

  async function saveModelImprovement() {
    setSaving(true);
    try {
      const saved = await api.updateProfile({ modelImprovementOptIn: modelImprovement });
      setModelImprovement(Boolean(saved.modelImprovementOptIn));
      toast.success("Model-improvement preference saved to your account");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save privacy preference");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy"
        description={`Export, account deletion, and the privacy choices ${product.name} can actually enforce.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Export and deletion</CardTitle>
          <CardDescription>Downloads and irreversible removals always confirm first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void exportData()}>
              Export my data
            </Button>
            <Button type="button" variant="secondary" disabled title={DELETE_DOCS_REASON} aria-describedby="delete-docs-reason">
              Delete documents
            </Button>
          </div>
          <p id="delete-docs-reason" className="text-xs text-foreground-muted">
            {DELETE_DOCS_REASON}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Retention</CardTitle>
          <CardDescription>Timed deletion of inactive artifacts is not implemented.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Retention window</span>
            <select
              aria-label="Retention window"
              className="h-10 rounded-[11px] border border-border-strong bg-surface px-3"
              disabled
              value="unavailable"
            >
              <option value="unavailable">Not available</option>
            </select>
          </label>
          <Button type="button" disabled title={RETENTION_REASON} aria-describedby="retention-unavailable">
            Save retention
          </Button>
          <p id="retention-unavailable" className="text-xs text-foreground-muted">
            {RETENTION_REASON}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence visibility & model improvement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Show share-safe evidence in application workspaces</span>
            <Switch checked={false} disabled aria-label="Evidence visibility" aria-describedby="evidence-visibility-unavailable" />
          </label>
          <p id="evidence-visibility-unavailable" className="text-xs text-foreground-muted">
            {EVIDENCE_VISIBILITY_REASON}
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Allow model improvement on anonymized patterns</span>
            <Switch
              checked={modelImprovement}
              onCheckedChange={setModelImprovement}
              disabled={!loaded || saving}
              aria-label="Model improvement"
            />
          </label>
          <p className="text-xs text-foreground-muted">{MODEL_IMPROVEMENT_COPY}</p>
          <Button type="button" onClick={() => void saveModelImprovement()} disabled={!loaded || saving}>
            {saving ? "Saving…" : "Save privacy controls"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-[color-mix(in_oklab,var(--destructive)_28%,transparent)]">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>Removes profile, opportunities, evidence, and application history.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" onClick={() => setDeleteAccountOpen(true)}>
            Delete account
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        title="Delete your account?"
        description={`This permanently deletes your ${product.name} account and all associated data.`}
        confirmLabel="Delete account"
        destructive
        onConfirm={() => void deleteAccount()}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
