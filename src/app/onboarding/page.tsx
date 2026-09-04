"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/tabs";
import { useOnboardingStore } from "@/stores/ui";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";
import { api, ApiError } from "@/services/api";
import type { ResumeImportExtraction } from "@/types/domain";

const steps = [
  { title: "Welcome and career goal", optional: false },
  { title: "Profile details", optional: false },
  { title: "Existing resume import", optional: true },
  { title: "Experience and project evidence", optional: true },
  { title: "Target roles", optional: false },
  { title: "Preferences", optional: false },
  { title: "Completion", optional: false },
] as const;

const roleFamilies = ["AI/ML Engineering", "Applied AI", "Backend Platform", "Full-stack", "Data Engineering"];

export default function OnboardingPage() {
  const router = useRouter();
  const { step, data, setStep, patch, reset } = useOnboardingStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<ResumeImportExtraction | null>(null);

  const progress = ((step + 1) / steps.length) * 100;
  const current = steps[step] ?? steps[0];

  const persist = useCallback(
    async (nextData: Record<string, unknown>, nextStep?: number) => {
      setSaving(true);
      try {
        const result = await api.updateOnboardingProgress({
          step: nextStep ?? step,
          data: nextData,
        });
        if (typeof nextStep === "number") setStep(nextStep);
        patch(nextData);
        return result;
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not save progress");
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [patch, setStep, step],
  );

  function autosave(next: Record<string, unknown>) {
    patch(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ ...data, ...next }).catch(() => undefined);
    }, 500);
  }

  useEffect(() => {
    void (async () => {
      try {
        const saved = await api.getOnboardingProgress();
        if (saved.step > 0) setStep(saved.step);
        patch({
          careerGoal: saved.data.careerGoal,
          fullName: saved.data.fullName,
          email: saved.data.email,
          phone: saved.data.phone,
          location: saved.data.location,
          github: saved.data.github,
          portfolio: saved.data.portfolio,
          targetRoles: saved.data.targetRoleFamilies,
          resumeLength: saved.data.preferredResumeLength,
          experienceLevel: saved.data.experienceLevel,
          modelImprovement: saved.data.modelImprovementOptIn,
        });
        const importState = await api.getResumeImportStatus();
        setImportStatus(importState.status);
        setExtraction(importState.extraction);
      } catch {
        /* unauthenticated users can still browse onboarding */
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [patch, setStep]);

  useEffect(() => {
    if (step !== 2 || !importStatus || ["ready_for_review", "confirmed", "failed"].includes(importStatus)) {
      return;
    }
    const timer = setInterval(() => {
      void api.getResumeImportStatus().then((state) => {
        setImportStatus(state.status);
        setExtraction(state.extraction);
        if (state.status === "ready_for_review") toast.message("Resume parsed — review extracted details");
        if (state.status === "failed") toast.error(state.extraction?.error ?? "Resume parsing failed");
      });
    }, 1500);
    return () => clearInterval(timer);
  }, [importStatus, step]);

  const summary = useMemo(
    () => ({
      goal: String(data.careerGoal ?? "Not set"),
      name: String(data.fullName ?? "Candidate"),
      roles: (Array.isArray(data.targetRoles) ? data.targetRoles : []) as string[],
      length: String(data.resumeLength ?? "one-page"),
      level: String(data.experienceLevel ?? "experienced"),
    }),
    [data],
  );

  async function next() {
    if (step === 0 && !String(data.careerGoal ?? "").trim()) {
      toast.error("Share a short career goal to continue");
      return;
    }
    if (step === 1 && !String(data.fullName ?? "").trim()) {
      toast.error("Add your name");
      return;
    }
    if (step === 4 && !(Array.isArray(data.targetRoles) && data.targetRoles.length)) {
      toast.error("Choose at least one target role family");
      return;
    }
    try {
      await persist(data, step >= steps.length - 1 ? step : step + 1);
    } catch {
      return;
    }
    if (step >= steps.length - 1) {
      try {
        await api.updateOnboardingProgress({ step, completed: true, data });
        toast.success("Onboarding complete");
        reset();
        router.push("/app");
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "Could not complete onboarding");
      }
      return;
    }
    setStep(step + 1);
  }

  function skip() {
    if (!current.optional) return;
    void persist(data, step + 1)
      .then(() => {
        toast.message("Skipped optional step");
        setStep(step + 1);
      })
      .catch(() => undefined);
  }

  async function handleResumeUpload(file: File) {
    setUploading(true);
    try {
      const result = await api.uploadResume(file);
      setImportStatus(result.importStatus);
      toast.message("Resume uploaded — scanning and parsing");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <p className="p-8 text-sm text-foreground-muted">Loading onboarding…</p>;
  }

  return (
    <div className="min-h-dvh bg-background arc-bg">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <p className="text-sm text-foreground-muted">
          Step {step + 1} of {steps.length}
          {saving ? " · saving…" : ""}
        </p>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <ProgressBar value={progress} className="mb-8" />
        <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">{current.title}</h1>
        <p className="mt-2 text-sm text-foreground-secondary">
          {product.name} uses this profile to keep every resume claim grounded.
        </p>

        <Card className="mt-8">
          <CardContent className="space-y-5 p-5 sm:p-6">
            {step === 0 ? (
              <div className="space-y-2">
                <Label htmlFor="goal">Career goal</Label>
                <Textarea
                  id="goal"
                  placeholder="e.g. CX AI Software Engineer roles focused on production RAG and inference"
                  value={String(data.careerGoal ?? "")}
                  onChange={(e) => autosave({ careerGoal: e.target.value })}
                />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name" value={String(data.fullName ?? "")} onChange={(fullName) => autosave({ fullName })} />
                <Field label="Email" value={String(data.email ?? "")} onChange={(email) => autosave({ email })} />
                <Field label="Location" value={String(data.location ?? "")} onChange={(location) => autosave({ location })} />
                <Field label="Phone" value={String(data.phone ?? "")} onChange={(phone) => autosave({ phone })} />
                <Field label="GitHub" value={String(data.github ?? "")} onChange={(github) => autosave({ github })} />
                <Field label="Portfolio" value={String(data.portfolio ?? "")} onChange={(portfolio) => autosave({ portfolio })} />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleResumeUpload(file);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? "Uploading…" : "Upload resume (PDF or DOCX)"}
                </Button>
                {importStatus ? (
                  <p className="text-sm text-foreground-secondary">Import status: {importStatus.replace(/_/g, " ")}</p>
                ) : null}
                {extraction && extraction.skills?.length ? (
                  <div className="rounded-xl border border-border bg-canvas p-4 text-sm">
                    <p className="font-medium">Extracted for review</p>
                    <p className="mt-2 text-foreground-muted">
                      Skills: {extraction.skills.slice(0, 12).join(", ")}
                      {extraction.skills.length > 12 ? "…" : ""}
                    </p>
                    {importStatus === "ready_for_review" ? (
                      <Button
                        type="button"
                        className="mt-3"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await api.confirmResumeImport();
                            setImportStatus("confirmed");
                            toast.success("Resume import confirmed");
                          } catch (err) {
                            toast.error(err instanceof ApiError ? err.message : "Confirmation failed");
                          }
                        }}
                      >
                        Confirm extracted profile details
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <Button type="button" variant="outline" disabled aria-disabled>
                  Import LinkedIn (coming soon)
                </Button>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-2">
                <Label htmlFor="evidence">Seed experience or project notes</Label>
                <Textarea
                  id="evidence"
                  placeholder="Projects, metrics, stacks you can verify…"
                  value={String(data.evidenceNotes ?? "")}
                  onChange={(e) => autosave({ evidenceNotes: e.target.value })}
                />
              </div>
            ) : null}

            {step === 4 ? (
              <div className="flex flex-wrap gap-2">
                {roleFamilies.map((role) => {
                  const selected = Array.isArray(data.targetRoles) && data.targetRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm",
                        selected
                          ? "border-accent bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-accent"
                          : "border-border hover:bg-surface-2",
                      )}
                      onClick={() => {
                        const currentRoles = Array.isArray(data.targetRoles) ? [...data.targetRoles] : [];
                        const nextRoles = selected ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];
                        autosave({ targetRoles: nextRoles });
                      }}
                    >
                      {role}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {step === 5 ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  {["student", "early-career", "experienced", "career-transition"].map((level) => (
                    <button
                      key={level}
                      type="button"
                      className={cn(
                        "rounded-xl border px-4 py-3 text-left text-sm capitalize",
                        data.experienceLevel === level
                          ? "border-accent bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                          : "border-border hover:bg-surface-2",
                      )}
                      onClick={() => autosave({ experienceLevel: level })}
                    >
                      {level.replace("-", " ")}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["one-page", "two-page"].map((len) => (
                    <button
                      key={len}
                      type="button"
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm capitalize",
                        data.resumeLength === len
                          ? "border-accent bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]"
                          : "border-border",
                      )}
                      onClick={() => autosave({ resumeLength: len })}
                    >
                      {len}
                    </button>
                  ))}
                </div>
                <label className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
                  <span className="text-sm">Allow model improvement on anonymized patterns</span>
                  <Switch
                    checked={Boolean(data.modelImprovement ?? true)}
                    onCheckedChange={(v) => autosave({ modelImprovement: v })}
                    aria-label="Model improvement"
                  />
                </label>
              </div>
            ) : null}

            {step === 6 ? (
              <div className="space-y-3 rounded-xl bg-canvas p-4 text-sm">
                <p><span className="text-foreground-muted">Name:</span> {summary.name}</p>
                <p><span className="text-foreground-muted">Goal:</span> {summary.goal}</p>
                <p>
                  <span className="text-foreground-muted">Roles:</span>{" "}
                  {summary.roles.length ? summary.roles.join(", ") : "None selected"}
                </p>
                <p><span className="text-foreground-muted">Profile:</span> {summary.level} · {summary.length}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" disabled={step === 0 || saving} onClick={() => setStep(Math.max(0, step - 1))}>
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                {current.optional ? (
                  <Button type="button" variant="secondary" disabled={saving} onClick={skip}>
                    Skip
                  </Button>
                ) : null}
                <Button type="button" disabled={saving} onClick={() => void next()}>
                  {step === steps.length - 1 ? "Enter app" : "Continue"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Link href="/app" className={cn(buttonVariants({ variant: "link" }), "mt-4")}>
          Skip to app
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
