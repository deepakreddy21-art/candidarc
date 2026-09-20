"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { JobPreferencesFields } from "@/components/onboarding/job-preferences-fields";
import { emptyOnboardingForm, formToPatch, type OnboardingFormState } from "@/components/onboarding/types";
import { profileToForm } from "@/lib/onboarding-form-map";
import { api, ApiError } from "@/services/api";

export default function JobPreferencesPage() {
  const [form, setForm] = useState<OnboardingFormState | null>(null);
  const draft = useRef(emptyOnboardingForm());
  const baseline = useRef(draft.current);
  const version = useRef<number | undefined>(undefined);
  const [loadError, setLoadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const load = useCallback(async () => {
    setLoadError(undefined);
    try {
      const profile = await api.getProfile();
      const next = profileToForm(profile, null);
      draft.current = baseline.current = next;
      version.current = profile.version;
      setForm(next);
      setConflict(false);
      setSaveError(undefined);
      setStatus("");
    } catch (err) { setLoadError(err instanceof Error ? err.message : "Could not load job preferences"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save() {
    if (saving || conflict || version.current === undefined) return;
    setSaving(true);
    setSaveError(undefined);
    const submitted = draft.current;
    try {
      const result = await api.updateOnboardingProgress({ expectedVersion: version.current, data: formToPatch(submitted, baseline.current) });
      version.current = result.version ?? result.profile.version;
      baseline.current = submitted;
      setStatus(draft.current === submitted ? "Saved" : "Unsaved changes");
    } catch (err) {
      setConflict(err instanceof ApiError && err.status === 409);
      setSaveError(err instanceof ApiError && err.status === 409 ? "These preferences changed in another tab. Your edits are still here. Load the saved preferences before editing again." : "Could not save. Your edits are still here; try again.");
    } finally { setSaving(false); }
  }
  if (loadError) return <ErrorState title="Could not load job preferences" description={loadError} onRetry={() => void load()} />;
  if (!form) return <Skeleton className="h-64 w-full" />;
  return <div className="max-w-3xl space-y-6">
    <PageHeader title="Job preferences" description="Choose the roles and working arrangements you want to see in Jobs." />
    <JobPreferencesFields form={form} errors={{}} onChange={(patch) => {
      draft.current = { ...draft.current, ...patch };
      setForm(draft.current);
      setStatus("Unsaved changes");
    }} />
    {saveError && <div role="alert" className="rounded-lg border border-destructive p-3 text-sm">{saveError}{conflict && <Button type="button" variant="secondary" className="mt-3 block" onClick={() => void load()}>Load saved preferences</Button>}</div>}
    <div className="flex items-center gap-3">
      <Button type="button" disabled={saving || conflict} onClick={() => void save()}>{saving ? "Saving…" : "Save job preferences"}</Button>
      <p role="status" className="text-sm text-foreground-secondary">{status}</p>
    </div>
  </div>;
}
