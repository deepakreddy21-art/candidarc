"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/ui";
import { useEffect, useState } from "react";

export default function PreferencesPage() {
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const storedDigest = useUiStore((s) => s.emailDigest);
  const storedOnePage = useUiStore((s) => s.onePageDefault);
  const setEmailDigest = useUiStore((s) => s.setEmailDigest);
  const setOnePageDefault = useUiStore((s) => s.setOnePageDefault);
  const [emailDigest, setDigestDraft] = useState(storedDigest);
  const [onePageDefault, setOnePageDraft] = useState(storedOnePage);

  useEffect(() => {
    setDigestDraft(storedDigest);
    setOnePageDraft(storedOnePage);
    setThemePreference("light");
  }, [storedDigest, storedOnePage, setThemePreference]);

  return (
    <div className="space-y-6">
      <PageHeader title="Preferences" description="Résumé defaults and notification cadence." />
      <Card>
        <CardContent className="space-y-4 p-5">
          <p className="rounded-lg bg-mint px-3 py-2 text-sm text-foreground">
            CandidArc uses a single light appearance. Dark mode is not available.
          </p>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Weekly email digest</span>
            <Switch checked={emailDigest} onCheckedChange={setDigestDraft} aria-label="Email digest" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Default to one-page résumés</span>
            <Switch checked={onePageDefault} onCheckedChange={setOnePageDraft} aria-label="One page default" />
          </label>
          <p className="text-xs text-foreground-muted">
            Digest and résumé-length defaults are stored on this device only. Email delivery stays off until a mail provider is configured.
          </p>
          <Button
            type="button"
            onClick={() => {
              setThemePreference("light");
              setEmailDigest(emailDigest);
              setOnePageDefault(onePageDefault);
              toast.success("Preferences saved");
            }}
          >
            Save preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
