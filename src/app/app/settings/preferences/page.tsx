"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/tabs";
import { useUiStore } from "@/stores/ui";
import { useState } from "react";

export default function PreferencesPage() {
  const themePreference = useUiStore((s) => s.themePreference);
  const setThemePreference = useUiStore((s) => s.setThemePreference);
  const [emailDigest, setEmailDigest] = useState(true);
  const [onePageDefault, setOnePageDefault] = useState(true);

  return (
    <div className="space-y-6">
      <PageHeader title="Preferences" description="Theme, resume defaults, and notification cadence." />
      <Card>
        <CardContent className="space-y-4 p-5">
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Theme</span>
            <select
              className="h-10 rounded-[11px] border border-border-strong bg-surface px-3"
              value={themePreference}
              onChange={(e) => setThemePreference(e.target.value as "light" | "dark" | "system")}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Weekly email digest</span>
            <Switch checked={emailDigest} onCheckedChange={setEmailDigest} aria-label="Email digest" />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>Default to one-page resumes</span>
            <Switch checked={onePageDefault} onCheckedChange={setOnePageDefault} aria-label="One page default" />
          </label>
          <Button type="button" onClick={() => toast.success("Preferences saved")}>
            Save preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
