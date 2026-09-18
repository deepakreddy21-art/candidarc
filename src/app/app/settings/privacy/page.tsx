"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/tabs";
import { product } from "@/config/product";
import { api, ApiError } from "@/services/api";

const DELETE_DOCS_REASON =
  "Per-document deletion is not available yet. Export your data to download a copy of what CandidArc stores for your account.";
const RETENTION_REASON =
  "Automatic retention windows are not available. CandidArc does not currently delete inactive artifacts on a timer. Export your data if you need a local copy.";
const ACCOUNT_DELETE_REASON =
  "Complete account deletion is not available yet. This release cannot safely remove your account, uploads, and associated data. Export your data below; your account remains active.";
const EVIDENCE_VISIBILITY_REASON =
  "Workspace evidence visibility is controlled per STAR item, not by a global account switch. This control is unavailable because it would not change server behavior.";
const MODEL_IMPROVEMENT_COPY =
  "Stored preference on your account only. CandidArc does not currently train models on your content, regardless of this setting. No training pipeline exists to honor an opt-in.";

export default function PrivacySettingsPage() {
  const [modelImprovement, setModelImprovement] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
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
        description={`Export and the privacy choices ${product.name} can actually enforce.`}
      />

      <Card>
        <CardHeader>
          <CardTitle>Export and deletion</CardTitle>
          <CardDescription>Downloads are available now. Complete account deletion is not.</CardDescription>
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
          <CardTitle>Account deletion</CardTitle>
          <CardDescription>Complete account deletion is not available in this release.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            type="button"
            variant="destructive"
            disabled
            title={ACCOUNT_DELETE_REASON}
            aria-describedby="account-delete-unavailable"
          >
            Delete account
          </Button>
          <p id="account-delete-unavailable" className="text-xs text-foreground-muted" data-testid="account-delete-unavailable">
            {ACCOUNT_DELETE_REASON}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
