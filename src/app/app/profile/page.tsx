"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { StepCareerProfile } from "@/components/onboarding/step-career-profile";
import { emptyOnboardingForm, formToPayload, type OnboardingFormState } from "@/components/onboarding/types";
import { profileToForm } from "@/lib/onboarding-form-map";
import { api, ApiError } from "@/services/api";
import type { CandidateProfile } from "@/types/domain";

export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [form, setForm] = useState<OnboardingFormState>(emptyOnboardingForm);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importErrorCode, setImportErrorCode] = useState<string | null>(null);
  const versionRef = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    const [saved, importState] = await Promise.all([api.getOnboardingProgress(), api.getResumeImportStatus()]);
    versionRef.current = saved.version ?? saved.data.version;
    setProfile(saved.data);
    setForm(profileToForm(saved.data, importState.extraction));
    setImportStatus(importState.status);
    setImportErrorCode(importState.extraction?.errorCode ?? null);
  }, []);

  useEffect(() => {
    void reload().catch((err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not load profile");
    });
  }, [reload]);

  async function saveCareer(next: OnboardingFormState) {
    setForm(next);
    if (typeof versionRef.current !== "number") return;
    try {
      const result = await api.updateOnboardingProgress({
        expectedVersion: versionRef.current,
        data: formToPayload(next),
      });
      versionRef.current = result.version ?? result.profile.version;
      setProfile(result.profile);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save career profile");
    }
  }

  if (!profile) return <p className="text-sm text-foreground-muted">Loading profile…</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Profile"
        description="Your canonical career record. Tailored documents live under Resumes."
      />
      <Card>
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          {(
            [
              ["fullName", "Full name"],
              ["preferredName", "Preferred name"],
              ["email", "Email"],
              ["phone", "Phone"],
              ["location", "Location"],
              ["linkedIn", "LinkedIn"],
              ["github", "GitHub"],
              ["portfolio", "Portfolio"],
              ["headline", "Headline"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={String(profile[key] ?? "")}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="summary">Summary</Label>
            <Textarea
              id="summary"
              value={profile.summary}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              onClick={async () => {
                try {
                  const saved = await api.updateProfile(profile);
                  setProfile(saved);
                  toast.success("Identity saved");
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Could not save profile");
                }
              }}
            >
              Save identity
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-xl">Career evidence</h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Re-import a résumé or edit employment, projects, education, and skills. A failed replacement keeps the last valid profile.
        </p>
        <div className="mt-4">
          <StepCareerProfile
            form={form}
            onChange={(patch) => void saveCareer({ ...form, ...patch })}
            errors={{}}
            importStatus={importStatus}
            uploading={uploading}
            onUpload={async (file) => {
              setUploading(true);
              setStatusMessage("Uploading…");
              try {
                const result = await api.uploadResume(file);
                setImportStatus(result.importStatus);
                setStatusMessage("Upload received — scanning…");
              } catch (err) {
                const code = err instanceof ApiError ? err.code : undefined;
                setImportErrorCode(code ?? "UPLOAD_FAILED");
                setStatusMessage(
                  err instanceof ApiError
                    ? `${err.message}${err.requestId ? ` (ref ${err.requestId})` : ""}`
                    : "Upload failed",
                );
                toast.error(err instanceof ApiError ? err.message : "Upload failed");
              } finally {
                setUploading(false);
              }
            }}
            onRetryImport={() => {
              setImportStatus("failed");
              setStatusMessage("Choose the same file again to retry import.");
            }}
            statusMessage={statusMessage}
            importErrorCode={importErrorCode}
          />
        </div>
      </div>
    </div>
  );
}
