"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OnboardingShell } from "@/components/onboarding/shell";
import { StepCareerDirection } from "@/components/onboarding/step-career-direction";
import { StepCareerProfile } from "@/components/onboarding/step-career-profile";
import { StepReview } from "@/components/onboarding/step-review";
import { StepWorkPreferences } from "@/components/onboarding/step-work-preferences";
import {
  emptyOnboardingForm,
  formToPatch,
  validateStepClient,
  type OnboardingFormState,
} from "@/components/onboarding/types";
import { mapLoadedOnboardingStep, ONBOARDING_LAST_STEP } from "@/lib/onboarding-flow";
import { createOnboardingSaveQueue } from "@/lib/onboarding-save-queue";
import { profileToForm } from "@/lib/onboarding-form-map";
import { api, ApiError } from "@/services/api";

export default function OnboardingPage() {
  const router = useRouter();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const versionRef = useRef<number | undefined>(undefined);
  const [form, setForm] = useState<OnboardingFormState>(emptyOnboardingForm);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importErrorCode, setImportErrorCode] = useState<string | null>(null);
  const pollStartedAt = useRef<number | null>(null);
  const baselineRef = useRef(form);
  const conflictRef = useRef(false);
  const [hasConflict, setHasConflict] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const stepRef = useRef(step);
  stepRef.current = step;

  const handleStale = useCallback(async () => {
    conflictRef.current = true;
    setHasConflict(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("Needs review");
    toast.error("Your profile changed elsewhere. Your unsaved changes are still here; reload the saved profile to continue.");
  }, []);

  async function reloadSavedProfile() {
    try {
      const state = await api.getResumeImportStatus();
      const next = profileToForm(state.profile, state.extraction);
      baselineRef.current = next;
      formRef.current = next;
      setForm(next);
      versionRef.current = state.version;
      setImportStatus(state.status);
      setStep(mapLoadedOnboardingStep(state.profile.onboardingStep, state.profile.onboardingFlowVersion));
      conflictRef.current = false;
      setHasConflict(false);
      setSaveStatus("Loaded saved profile");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reload profile");
    }
  }

  const saveQueueRef = useRef<ReturnType<typeof createOnboardingSaveQueue<OnboardingFormState, { version: number }>> | null>(
    null,
  );
  if (!saveQueueRef.current) {
    saveQueueRef.current = createOnboardingSaveQueue({
      getExpectedVersion: () => versionRef.current,
      setVersion: (v) => {
        versionRef.current = v;
      },
      isStaleError: (err) => err instanceof ApiError && err.status === 409,
      onStale: handleStale,
      onSavingChange: setSaving,
      onSaved: () => setSaveStatus("Saved"),
      onSaveFailed: () => setSaveStatus("Save failed"),
      save: async (job) => {
        if (conflictRef.current) throw new ApiError("Reload the saved profile before saving", 409);
        const result = await api.updateOnboardingProgress({
          step: job.step ?? stepRef.current,
          completed: job.completed,
          expectedVersion: job.expectedVersion,
          data: formToPatch(job.form, baselineRef.current),
        });
        const nextVersion = result.version ?? result.profile.version;
        if (typeof nextVersion !== "number") {
          throw new ApiError("Server did not return an onboarding version", 500);
        }
        baselineRef.current = job.form;
        if (typeof job.step === "number") setStep(job.step);
        return { version: nextVersion, profile: result.profile };
      },
    });
  }
  const saveQueue = saveQueueRef.current;

  const enqueueSave = useCallback(
    (request: { form: OnboardingFormState; step?: number; completed?: boolean }) =>
      saveQueue.enqueue(request).catch(() => undefined),
    [saveQueue],
  );

  const flushQueue = useCallback(
    async (request?: { form: OnboardingFormState; step?: number; completed?: boolean }) => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      await saveQueue.flush(request ?? { form: formRef.current, step: stepRef.current });
    },
    [saveQueue],
  );

  function patchForm(patch: Partial<OnboardingFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      formRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (!conflictRef.current) void enqueueSave({ form: formRef.current });
      }, 700);
      return next;
    });
    setErrors({});
  }

  async function syncVersionFromServer() {
    const saved = await api.getOnboardingProgress();
    versionRef.current = saved.version ?? saved.data.version;
    return saved;
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await api.getOnboardingProgress();
        if (cancelled) return;
        if (saved.completedAt) {
          router.replace("/app");
          return;
        }
        const importState = await api.getResumeImportStatus();
        if (cancelled) return;
        setImportStatus(importState.status);
        const nextForm = profileToForm(importState.profile, importState.extraction);
        baselineRef.current = nextForm;
        formRef.current = nextForm;
        setForm(nextForm);
        setStep(mapLoadedOnboardingStep(saved.step, saved.data.onboardingFlowVersion));
        versionRef.current = importState.version;
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/sign-in?next=/onboarding");
          return;
        }
        toast.error("Could not load onboarding");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [router]);

  useEffect(() => {
    if (!importStatus || ["ready_for_review", "confirmed", "failed"].includes(importStatus)) {
      pollStartedAt.current = null;
      return;
    }
    if (!pollStartedAt.current) pollStartedAt.current = Date.now();
    let cancelled = false;
    let inFlight = false;
    const timer = setInterval(() => {
      if (inFlight || cancelled) return;
      inFlight = true;
      void (async () => {
        try {
          if (pollStartedAt.current && Date.now() - pollStartedAt.current > 90_000) {
            setImportStatus("failed");
            setImportErrorCode("IMPORT_TIMEOUT");
            setStatusMessage("Import is taking too long. Retry or enter details manually.");
            return;
          }
          const state = await api.getResumeImportStatus();
          if (cancelled) return;
          setImportStatus(state.status);
          setImportErrorCode(state.extraction?.errorCode ?? null);
          if (state.status === "ready_for_review" || state.status === "confirmed") {
            const next = profileToForm(state.profile, state.extraction);
            baselineRef.current = next;
            formRef.current = next;
            setForm(next);
            versionRef.current = state.version;
            setStatusMessage("Resume ready — review the details below, then Continue");
            setSaveStatus(null);
          }
          if (state.status === "failed") {
            versionRef.current = state.version;
            setStatusMessage(state.extraction?.error ?? "Resume parsing failed");
          }
        } catch (err) {
          if (!cancelled) setStatusMessage(err instanceof ApiError ? err.message : "Could not check import status — retrying…");
        } finally {
          inFlight = false;
        }
      })();
    }, 1500);
    return () => { cancelled = true; clearInterval(timer); };
  }, [importStatus]);

  async function handleUpload(file: File) {
    setUploading(true);
    setStatusMessage("Uploading…");
    setImportErrorCode(null);
    try {
      await flushQueue({ form: formRef.current, step: stepRef.current });
      // Keep confirmed/draft form values visible until the new extraction is ready.
      // Do not debounce-save here: an empty career autosave can race the Python parse and
      // clobber employment/projects while contact/certificationEntries still look fine.
      setForm((prev) => {
        const next = { ...prev, careerProfileMode: "upload" as const };
        formRef.current = next;
        return next;
      });
      const result = await api.uploadResume(file);
      setImportStatus(result.importStatus);
      setStatusMessage("Upload received — security scanning…");
      pollStartedAt.current = Date.now();
      await syncVersionFromServer();
    } catch (err) {
      setStatusMessage(err instanceof ApiError ? err.message : "Upload failed");
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRetryImport() {
    setImportErrorCode(null);
    setStatusMessage("Retrying…");
    try {
      const state = await api.getResumeImportStatus();
      if (state.file?.id) {
        // Re-upload is the safest idempotent retry path for the user — ask them to pick the file again.
        setImportStatus("failed");
        setStatusMessage("Choose the same file again to retry import.");
      } else {
        setStatusMessage("Choose a PDF or DOCX to retry.");
      }
    } catch (err) {
      setStatusMessage(err instanceof ApiError ? err.message : "Retry failed");
    }
  }

  async function handleConfirmImport() {
    try {
      await flushQueue({ form: formRef.current, step: stepRef.current });
      const result = await api.confirmResumeImport(versionRef.current);
      setImportStatus("confirmed");
      const nextForm = profileToForm(result.profile, result.extraction);
      baselineRef.current = nextForm;
      formRef.current = nextForm;
      setForm(nextForm);
      versionRef.current = result.profile.version;
      setStatusMessage("Career profile confirmed");
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await handleStale();
        return false;
      }
      toast.error(err instanceof ApiError ? err.message : "Could not confirm resume");
      return false;
    }
  }

  async function handleContinue() {
    const current = formRef.current;
    const message = validateStepClient(step, current, importStatus);
    if (message) {
      if (step === 0 && !current.targetRoles.length) setErrors({ targetRoles: message });
      else if (step === 0 && !current.seniority) setErrors({ seniority: message });
      else if (step === 0 && !current.jobTypes.length) setErrors({ jobTypes: message });
      else if (step === 0) setErrors({ workplaceModes: message });
      else if (step === 1 && !current.fullName.trim()) setErrors({ fullName: message });
      else setErrors({ career: message });
      toast.error(message);
      return;
    }

    if (step === 1 && importStatus === "ready_for_review") {
      const ok = await handleConfirmImport();
      if (!ok) return;
    }

    if (step < ONBOARDING_LAST_STEP) {
      try {
        await flushQueue({ form: formRef.current, step: step + 1 });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) {
          toast.error(err instanceof ApiError ? err.message : "Could not save progress");
        }
      }
      return;
    }

    try {
      await flushQueue({ form: formRef.current, step: ONBOARDING_LAST_STEP, completed: true });
      router.push("/onboarding/complete");
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) {
        toast.error(err instanceof ApiError ? err.message : "Could not finish setup");
      }
    }
  }

  async function handleBack() {
    if (step === 0) return;
    try {
      await flushQueue({ form: formRef.current, step: step - 1 });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) {
        toast.error(err instanceof ApiError ? err.message : "Could not save progress");
      }
    }
  }

  async function handleLogout() {
    try {
      await flushQueue({ form: formRef.current, step: stepRef.current }).catch(() => undefined);
      const csrf = document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1];
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: csrf ? { "x-csrf-token": decodeURIComponent(csrf) } : {},
      });
    } finally {
      router.push("/sign-in");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-sm text-foreground-muted">
        Loading your onboarding…
      </div>
    );
  }

  return (
    <OnboardingShell
      step={step}
      saving={saving}
      saveStatus={saveStatus}
      onBack={() => void handleBack()}
      onContinue={() => void handleContinue()}
      onLogout={() => void handleLogout()}
      continueLabel={step === ONBOARDING_LAST_STEP ? "Finish setup" : "Continue"}
      continueDisabled={hasConflict || uploading || ["pending_scan", "scan_clean", "extracting"].includes(importStatus ?? "")}
    >
      {hasConflict ? (
        <div role="alert" className="mb-4 rounded-lg border border-warning p-4">
          <p>Your profile changed elsewhere. Your unsaved changes remain below. Copy anything you want to keep before loading the saved profile.</p>
          <button type="button" className="mt-2 underline" onClick={() => void reloadSavedProfile()}>Load saved profile</button>
        </div>
      ) : null}
      {step === 0 ? (
        <div className="space-y-8">
          <StepCareerDirection form={form} onChange={patchForm} errors={errors} />
          <StepWorkPreferences form={form} onChange={patchForm} errors={errors} />
        </div>
      ) : null}
      {step === 1 ? (
        <StepCareerProfile
          form={form}
          onChange={patchForm}
          errors={errors}
          importStatus={importStatus}
          uploading={uploading}
          onUpload={(file) => void handleUpload(file)}
          onRetryImport={() => void handleRetryImport()}
          statusMessage={statusMessage}
          importErrorCode={importErrorCode}
        />
      ) : null}
      {step === 2 ? (
        <StepReview
          form={form}
          importStatus={importStatus}
          onEditStep={(next) => {
            void flushQueue({ form: formRef.current, step: next }).catch((err) => {
              if (!(err instanceof ApiError && err.status === 409)) {
                toast.error(err instanceof ApiError ? err.message : "Could not save progress");
              }
            });
          }}
        />
      ) : null}
    </OnboardingShell>
  );
}
