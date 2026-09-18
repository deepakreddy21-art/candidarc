"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { StepCareerProfile } from "@/components/onboarding/step-career-profile";
import { emptyOnboardingForm, formToPayload, type OnboardingFormState } from "@/components/onboarding/types";
import { profileToForm } from "@/lib/onboarding-form-map";
import { api, ApiError, isCancelledError } from "@/services/api";
import type { CandidateProfile } from "@/types/domain";

export default function ProfilePage() {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [form, setForm] = useState<OnboardingFormState>(emptyOnboardingForm);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importErrorCode, setImportErrorCode] = useState<string | null>(null);
  const [identitySnapshot, setIdentitySnapshot] = useState<CandidateProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [importSectionError, setImportSectionError] = useState<string | null>(null);
  const versionRef = useRef<number | undefined>(undefined);
  const profileRef = useRef<CandidateProfile | null>(null);
  const pollStartedAt = useRef<number | null>(null);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setProfileError(null);
    try {
      const saved = await api.getOnboardingProgress();
      if (signal?.aborted) return;
      versionRef.current = saved.version ?? saved.data.version;
      profileRef.current = saved.data;
      setProfile(saved.data);
      setIdentitySnapshot(saved.data);
      setForm(profileToForm(saved.data, null));
    } catch (err) {
      if (isCancelledError(err) || signal?.aborted) return;
      setProfileError(err instanceof ApiError ? err.message : "Could not load profile");
    }
  }, []);

  const loadImport = useCallback(async (signal?: AbortSignal) => {
    const current = profileRef.current;
    if (!current) return;
    setImportSectionError(null);
    try {
      const importState = await api.getResumeImportStatus();
      if (signal?.aborted) return;
      setImportStatus(importState.status);
      setImportErrorCode(importState.extraction?.errorCode ?? null);
      setForm((prev) => {
        const next = profileToForm(current, importState.extraction);
        // Prefer the user's in-page mode choice (e.g. switching Manual → Upload to re-import).
        // Extraction may still carry careerProfileMode: "manual" from an earlier draft.
        const mode =
          prev.careerProfileMode === "upload" || prev.careerProfileMode === "manual"
            ? prev.careerProfileMode
            : next.careerProfileMode || (importState.status ? "upload" : prev.careerProfileMode);
        return { ...next, careerProfileMode: mode };
      });
      if (importState.status === "failed") {
        setStatusMessage(importState.extraction?.error ?? "We couldn’t read that file.");
      }
    } catch (err) {
      if (isCancelledError(err) || signal?.aborted) return;
      setImportSectionError(err instanceof ApiError ? err.message : "Could not load résumé import status");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProfile(controller.signal).then(() => {
      if (!controller.signal.aborted) void loadImport(controller.signal);
    });
    return () => controller.abort();
  }, [loadImport, loadProfile]);

  useEffect(() => {
    if (!importStatus || ["ready_for_review", "confirmed", "failed"].includes(importStatus)) {
      pollStartedAt.current = null;
      return;
    }
    if (!pollStartedAt.current) pollStartedAt.current = Date.now();
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          if (pollStartedAt.current && Date.now() - pollStartedAt.current > 90_000) {
            setImportStatus("failed");
            setImportErrorCode("IMPORT_TIMEOUT");
            setStatusMessage("Import is taking too long. Retry or enter details manually.");
            return;
          }
          const state = await api.getResumeImportStatus();
          setImportStatus(state.status);
          setImportErrorCode(state.extraction?.errorCode ?? null);
          if (state.extraction && profileRef.current) {
            setForm((prev) => {
              const next = profileToForm(profileRef.current!, state.extraction);
              const mode =
                prev.careerProfileMode === "upload" || prev.careerProfileMode === "manual"
                  ? prev.careerProfileMode
                  : next.careerProfileMode || prev.careerProfileMode || "upload";
              return {
                ...next,
                careerProfileMode: mode,
              };
            });
          }
          if (state.status === "ready_for_review") {
            setStatusMessage("Resume ready — review the details below");
          }
          if (state.status === "failed") {
            setStatusMessage(state.extraction?.error ?? "Resume parsing failed");
            setForm((prev) => ({ ...prev, careerProfileMode: prev.careerProfileMode || "upload" }));
          }
        } catch (err) {
          if (isCancelledError(err)) return;
          setStatusMessage(err instanceof ApiError ? err.message : "Could not check import status — retrying…");
        }
      })();
    }, 1500);
    return () => window.clearInterval(timer);
  }, [importStatus]);

  async function saveCareer(next: OnboardingFormState) {
    if (typeof versionRef.current !== "number") return;
    try {
      const result = await api.updateOnboardingProgress({
        expectedVersion: versionRef.current,
        data: formToPayload(next),
      });
      versionRef.current = result.version ?? result.profile.version;
      profileRef.current = result.profile;
      setProfile(result.profile);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save career profile");
    }
  }

  function patchCareer(patch: Partial<OnboardingFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // Mode toggles must update local UI immediately; persist in the background.
      void saveCareer(next);
      return next;
    });
  }

  if (profileError && !profile) {
    return <ErrorState title="Could not load profile" description={profileError} onRetry={() => void loadProfile()} />;
  }

  if (!profile) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <span className="sr-only">Loading profile</span>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

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
              <Label htmlFor={`identity-${key}`}>{label}</Label>
              <Input
                id={`identity-${key}`}
                value={String(profile[key] ?? "")}
                onChange={(e) => setProfile({ ...profile, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="identity-summary">Summary</Label>
            <Textarea
              id="identity-summary"
              value={profile.summary}
              onChange={(e) => setProfile({ ...profile, summary: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button
              type="button"
              onClick={async () => {
                try {
                  const saved = await api.updateProfile(profile);
                  profileRef.current = saved;
                  setProfile(saved);
                  setIdentitySnapshot(saved);
                  toast.success("Identity saved");
                } catch (err) {
                  toast.error(err instanceof ApiError ? err.message : "Could not save profile");
                }
              }}
            >
              Save identity
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (identitySnapshot) setProfile(identitySnapshot);
                toast.message("Identity edits discarded");
              }}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-serif text-xl">Career evidence</h2>
        <p className="mt-1 text-sm text-foreground-secondary">
          Re-import a résumé or edit employment, projects, education, and skills. A failed replacement keeps the last valid profile.
        </p>
        {importSectionError ? (
          <div className="mt-4">
            <ErrorState
              title="Import status unavailable"
              description={importSectionError}
              onRetry={() => void loadImport()}
            />
          </div>
        ) : null}
        <div className="mt-4">
          <StepCareerProfile
            form={form}
            onChange={patchCareer}
            errors={{}}
            importStatus={importStatus}
            uploading={uploading}
            onUpload={async (file) => {
              setUploading(true);
              setImportStatus(null);
              setImportErrorCode(null);
              setStatusMessage("Uploading…");
              setForm((prev) => ({ ...prev, careerProfileMode: "upload" }));
              try {
                const result = await api.uploadResume(file);
                setImportStatus(result.importStatus);
                setStatusMessage("Upload received — scanning…");
              } catch (err) {
                const code = err instanceof ApiError ? err.code : undefined;
                setImportErrorCode(code ?? "UPLOAD_FAILED");
                setImportStatus("failed");
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
          {importStatus === "ready_for_review" ? (
            <div className="mt-4">
              <Button
                type="button"
                onClick={async () => {
                  try {
                    const confirmed = await api.confirmResumeImport();
                    profileRef.current = confirmed.profile;
                    setProfile(confirmed.profile);
                    setForm(profileToForm(confirmed.profile, confirmed.extraction));
                    setImportStatus("confirmed");
                    toast.success("Imported career details confirmed");
                  } catch (err) {
                    toast.error(err instanceof ApiError ? err.message : "Could not confirm import");
                  }
                }}
              >
                Confirm import
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
