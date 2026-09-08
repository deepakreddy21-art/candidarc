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
  formToPayload,
  validateStepClient,
  type OnboardingFormState,
} from "@/components/onboarding/types";
import { createOnboardingSaveQueue } from "@/lib/onboarding-save-queue";
import { mergeExtractionPreservingPreferences, profileToForm } from "@/lib/onboarding-form-map";
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
  const formRef = useRef(form);
  formRef.current = form;
  const stepRef = useRef(step);
  stepRef.current = step;

  const handleStale = useCallback(async () => {
    toast.error("Your profile changed in another tab. Review the latest information before continuing.");
    try {
      const saved = await api.getOnboardingProgress();
      versionRef.current = saved.version ?? saved.data.version;
      const importState = await api.getResumeImportStatus();
      setImportStatus(importState.status);
      setStep(Math.min(Math.max(saved.step ?? 0, 0), 3));
      setSaveStatus("Needs review");
    } catch {
      setSaveStatus("Save failed");
    }
  }, []);

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
        const result = await api.updateOnboardingProgress({
          step: job.step ?? stepRef.current,
          completed: job.completed,
          expectedVersion: job.expectedVersion,
          data: formToPayload(job.form),
        });
        const nextVersion = result.version ?? result.profile.version;
        if (typeof nextVersion !== "number") {
          throw new ApiError("Server did not return an onboarding version", 500);
        }
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
        void enqueueSave({ form: formRef.current });
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
    void (async () => {
      try {
        const saved = await api.getOnboardingProgress();
        if (saved.completedAt) {
          router.replace("/app");
          return;
        }
        const importState = await api.getResumeImportStatus();
        setImportStatus(importState.status);
        const nextForm = profileToForm(saved.data, importState.extraction);
        formRef.current = nextForm;
        setForm(nextForm);
        setStep(Math.min(Math.max(saved.step ?? 0, 0), 3));
        versionRef.current = saved.version ?? saved.data.version;
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          router.replace("/sign-in?next=/onboarding");
          return;
        }
        toast.error("Could not load onboarding");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [router]);

  useEffect(() => {
    if (!importStatus || ["ready_for_review", "confirmed", "failed"].includes(importStatus)) return;
    const timer = setInterval(() => {
      void api
        .getResumeImportStatus()
        .then(async (state) => {
          setImportStatus(state.status);
          try {
            await syncVersionFromServer();
          } catch {
            /* keep local version until next successful save */
          }
          if (state.extraction) {
            setForm((prev) => {
              const next = mergeExtractionPreservingPreferences(prev, state.extraction!);
              formRef.current = next;
              return next;
            });
          }
          if (state.status === "ready_for_review") setStatusMessage("Resume ready — review the details below");
          if (state.status === "failed") {
            setStatusMessage(state.extraction?.error ?? "Resume parsing failed");
          }
        })
        .catch(() => undefined);
    }, 1500);
    return () => clearInterval(timer);
  }, [importStatus]);

  async function handleUpload(file: File) {
    setUploading(true);
    setStatusMessage("Uploading…");
    try {
      await flushQueue({ form: formRef.current, step: stepRef.current });
      const result = await api.uploadResume(file);
      setImportStatus(result.importStatus);
      setStatusMessage("Upload received — analyzing…");
      await syncVersionFromServer();
      patchForm({ careerProfileMode: "upload" });
    } catch (err) {
      setStatusMessage(err instanceof ApiError ? err.message : "Upload failed");
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmImport() {
    try {
      await flushQueue({ form: formRef.current, step: stepRef.current });
      const result = await api.confirmResumeImport();
      setImportStatus("confirmed");
      const nextForm = profileToForm(result.profile, result.extraction);
      formRef.current = nextForm;
      setForm(nextForm);
      versionRef.current = result.profile.version;
      setStatusMessage("Career profile confirmed");
      toast.success("Career details confirmed");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await handleStale();
        return;
      }
      toast.error(err instanceof ApiError ? err.message : "Could not confirm resume");
    }
  }

  async function handleContinue() {
    const current = formRef.current;
    const message = validateStepClient(step, current, importStatus);
    if (message) {
      if (step === 0 && !current.targetRoles.length) setErrors({ targetRoles: message });
      else if (step === 0) setErrors({ seniority: message });
      else if (step === 1 && !current.jobTypes.length) setErrors({ jobTypes: message });
      else if (step === 1) setErrors({ workplaceModes: message });
      else if (step === 2 && !current.fullName.trim()) setErrors({ fullName: message });
      else setErrors({ career: message });
      toast.error(message);
      return;
    }

    if (step < 3) {
      try {
        await flushQueue({ form: current, step: step + 1 });
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) {
          toast.error(err instanceof ApiError ? err.message : "Could not save progress");
        }
      }
      return;
    }

    try {
      await flushQueue({ form: current, step: 3, completed: true });
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
      continueLabel={step === 3 ? "Finish setup" : "Continue"}
    >
      {step === 0 ? <StepCareerDirection form={form} onChange={patchForm} errors={errors} /> : null}
      {step === 1 ? <StepWorkPreferences form={form} onChange={patchForm} errors={errors} /> : null}
      {step === 2 ? (
        <StepCareerProfile
          form={form}
          onChange={patchForm}
          errors={errors}
          importStatus={importStatus}
          uploading={uploading}
          onUpload={(file) => void handleUpload(file)}
          onConfirmImport={() => void handleConfirmImport()}
          statusMessage={statusMessage}
        />
      ) : null}
      {step === 3 ? (
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
