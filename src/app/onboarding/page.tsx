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
import { api, ApiError } from "@/services/api";
import type { CandidateProfile, ResumeImportExtraction } from "@/types/domain";

function profileToForm(profile: CandidateProfile, extraction: ResumeImportExtraction | null): OnboardingFormState {
  const base = emptyOnboardingForm();
  const contact = extraction?.contact ?? {};
  return {
    ...base,
    targetRoles: profile.targetRoleFamilies ?? [],
    seniority: profile.seniority ?? "",
    targetCompanies: profile.targetCompanies ?? [],
    targetIndustries: profile.targetIndustries ?? [],
    jobTypes: profile.jobTypes ?? [],
    workplaceModes: profile.workplaceModes ?? [],
    preferredLocations: profile.preferredLocations ?? [],
    willingToRelocate: profile.willingToRelocate ?? null,
    workAuthorization: profile.workAuthorization ?? "",
    requiresSponsorship: profile.requiresSponsorship ?? null,
    salaryPreference: profile.salaryPreference ?? "",
    fullName: profile.fullName || contact.fullName || "",
    email: profile.email || contact.email || "",
    phone: profile.phone || contact.phone || "",
    location: profile.location || contact.location || "",
    linkedIn: profile.linkedIn || contact.linkedIn || "",
    github: profile.github || contact.github || "",
    portfolio: profile.portfolio || contact.portfolio || "",
    headline: profile.headline || "",
    summary: profile.summary || "",
    skills: Array.isArray(extraction?.skills) ? extraction!.skills.filter(Boolean) : [],
    employment: (extraction?.employment ?? []).map((row) => ({
      title: row.title,
      company: row.company,
      location: row.location,
      startDate: row.startDate,
      endDate: row.endDate,
      bullets: row.bullets ?? [],
    })),
    education: (extraction?.education ?? []).map((row) => ({
      school: row.institution,
      degree: row.degree,
      field: row.field,
      endDate: row.endDate,
    })),
    certifications: (extraction?.certifications ?? []).map((name) =>
      typeof name === "string" ? { name } : { name: "" },
    ),
    careerProfileMode:
      ((extraction as { careerProfileMode?: "upload" | "manual" } | null)?.careerProfileMode as
        | "upload"
        | "manual"
        | undefined) || (profile.resumeImportStatus ? "upload" : ""),
    evidenceNotes: "",
  };
}

export default function OnboardingPage() {
  const router = useRouter();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [version, setVersion] = useState<number | undefined>();
  const versionRef = useRef<number | undefined>(undefined);
  const pendingSave = useRef<Promise<unknown> | null>(null);
  const [form, setForm] = useState<OnboardingFormState>(emptyOnboardingForm);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const formRef = useRef(form);
  formRef.current = form;

  const persist = useCallback(
    async (nextForm: OnboardingFormState, nextStep?: number, completed = false) => {
      setSaving(true);
      setSaveStatus(null);
      const run = async () => {
        try {
          const result = await api.updateOnboardingProgress({
            step: nextStep ?? step,
            completed,
            data: formToPayload(nextForm),
          });
          const nextVersion = result.version ?? result.profile.version;
          versionRef.current = nextVersion;
          setVersion(nextVersion);
          if (typeof nextStep === "number") setStep(nextStep);
          setSaveStatus("Saved");
          return result;
        } catch (err) {
          const message = err instanceof ApiError ? err.message : "Could not save progress";
          toast.error(message);
          setSaveStatus("Save failed");
          throw err;
        } finally {
          setSaving(false);
        }
      };
      const promise = run();
      pendingSave.current = promise.finally(() => {
        if (pendingSave.current === promise) pendingSave.current = null;
      });
      return promise;
    },
    [step],
  );

  function patchForm(patch: Partial<OnboardingFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      formRef.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persist(next).catch(() => undefined);
      }, 700);
      return next;
    });
    setErrors({});
  }

  async function flushPersist(
    nextForm: OnboardingFormState,
    nextStep?: number,
    completed = false,
  ) {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (pendingSave.current) {
      await pendingSave.current.catch(() => undefined);
    }
    return persist(nextForm, nextStep, completed);
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
        setForm(profileToForm(saved.data, importState.extraction));
        setStep(Math.min(Math.max(saved.step ?? 0, 0), 3));
        const loadedVersion = saved.version ?? saved.data.version;
        versionRef.current = loadedVersion;
        setVersion(loadedVersion);
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
      void api.getResumeImportStatus().then((state) => {
        setImportStatus(state.status);
        if (state.extraction) {
          setForm((prev) => {
            const mapped = profileToForm(
              {
                id: "",
                fullName: prev.fullName,
                preferredName: "",
                email: prev.email,
                phone: prev.phone,
                location: prev.location,
                linkedIn: prev.linkedIn,
                github: prev.github,
                portfolio: prev.portfolio,
                headline: prev.headline,
                summary: prev.summary,
                experienceLevel: "experienced",
                yearsExperience: 0,
                targetRoleFamilies: prev.targetRoles,
                preferredResumeLength: "one-page",
                careerGoal: "",
                avatarInitials: "",
                preferredLocations: prev.preferredLocations,
                seniority: prev.seniority,
                targetCompanies: prev.targetCompanies,
                targetIndustries: prev.targetIndustries,
                jobTypes: prev.jobTypes,
                workplaceModes: prev.workplaceModes,
                willingToRelocate: prev.willingToRelocate,
                workAuthorization: prev.workAuthorization,
                requiresSponsorship: prev.requiresSponsorship ?? undefined,
                salaryPreference: prev.salaryPreference,
              },
              state.extraction,
            );
            return {
              ...mapped,
              careerProfileMode: "upload",
              targetRoles: prev.targetRoles,
              seniority: prev.seniority,
              targetCompanies: prev.targetCompanies,
              targetIndustries: prev.targetIndustries,
              jobTypes: prev.jobTypes,
              workplaceModes: prev.workplaceModes,
              preferredLocations: prev.preferredLocations,
              willingToRelocate: prev.willingToRelocate,
              workAuthorization: prev.workAuthorization,
              requiresSponsorship: prev.requiresSponsorship,
              salaryPreference: prev.salaryPreference,
            };
          });
        }
        if (state.status === "ready_for_review") setStatusMessage("Resume ready — review the details below");
        if (state.status === "failed") {
          setStatusMessage(state.extraction?.error ?? "Resume parsing failed");
        }
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [importStatus]);

  async function handleUpload(file: File) {
    setUploading(true);
    setStatusMessage("Uploading…");
    try {
      const result = await api.uploadResume(file);
      setImportStatus(result.importStatus);
      setStatusMessage("Upload received — analyzing…");
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
      const result = await api.confirmResumeImport();
      setImportStatus("confirmed");
      setForm(profileToForm(result.profile, result.extraction));
      setStatusMessage("Career profile confirmed");
      toast.success("Career details confirmed");
    } catch (err) {
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
        await flushPersist(current, step + 1);
      } catch {
        return;
      }
      return;
    }

    try {
      await flushPersist(current, 3, true);
      router.push("/onboarding/complete");
    } catch {
      return;
    }
  }

  async function handleBack() {
    if (step === 0) return;
    try {
      await flushPersist(formRef.current, step - 1);
    } catch {
      setStep(step - 1);
    }
  }

  async function handleLogout() {
    try {
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
            void flushPersist(formRef.current, next).catch(() => setStep(next));
          }}
        />
      ) : null}
    </OnboardingShell>
  );
}
