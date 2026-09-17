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

const PRIVACY_STORAGE_KEY = "candidarc-privacy";
const DELETE_DOCS_REASON =
  "Per-document deletion is not available yet. Export your data, or delete the account to remove all uploads.";

function csrfToken() {
  const raw =
    document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ??
    document.cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.split("=")[1] ??
    "";
  return decodeURIComponent(raw);
}

export default function PrivacySettingsPage() {
  const [retention, setRetention] = useState("12");
  const [evidenceVisibility, setEvidenceVisibility] = useState(true);
  const [modelImprovement, setModelImprovement] = useState(true);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRIVACY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        retention?: string;
        evidenceVisibility?: boolean;
        modelImprovement?: boolean;
      };
      if (parsed.retention) setRetention(parsed.retention);
      if (typeof parsed.evidenceVisibility === "boolean") setEvidenceVisibility(parsed.evidenceVisibility);
      if (typeof parsed.modelImprovement === "boolean") setModelImprovement(parsed.modelImprovement);
    } catch {
      /* ignore corrupt local preferences */
    }
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

  function persistPrivacy(next?: {
    retention?: string;
    evidenceVisibility?: boolean;
    modelImprovement?: boolean;
  }) {
    const payload = {
      retention: next?.retention ?? retention,
      evidenceVisibility: next?.evidenceVisibility ?? evidenceVisibility,
      modelImprovement: next?.modelImprovement ?? modelImprovement,
    };
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Privacy"
        description={`Control retention, exports, and what ${product.name} may learn from your work.`}
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
          <CardDescription>How long inactive application artifacts remain available.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Retention window</span>
            <select
              aria-label="Retention window"
              className="h-10 rounded-[11px] border border-border-strong bg-surface px-3"
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            >
              <option value="3">3 months</option>
              <option value="6">6 months</option>
              <option value="12">12 months</option>
              <option value="24">24 months</option>
            </select>
          </label>
          <Button
            type="button"
            onClick={() => {
              persistPrivacy({ retention });
              toast.success("Retention preference saved");
            }}
          >
            Save retention
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evidence visibility & model improvement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Show share-safe evidence in application workspaces</span>
            <Switch
              checked={evidenceVisibility}
              onCheckedChange={setEvidenceVisibility}
              aria-label="Evidence visibility"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Allow model improvement on anonymized patterns</span>
            <Switch
              checked={modelImprovement}
              onCheckedChange={setModelImprovement}
              aria-label="Model improvement"
            />
          </label>
          <Button
            type="button"
            onClick={() => {
              persistPrivacy({ evidenceVisibility, modelImprovement });
              toast.success("Privacy controls saved");
            }}
          >
            Save privacy controls
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
