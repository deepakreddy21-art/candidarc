"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
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

  const progress = ((step + 1) / steps.length) * 100;
  const current = steps[step] ?? steps[0];

  function autosave(next: Record<string, unknown>) {
    patch(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => toast.message("Progress saved"), 350);
  }

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

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

  function next() {
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
    if (step >= steps.length - 1) {
      toast.success("Onboarding complete");
      reset();
      router.push("/app");
      return;
    }
    setStep(step + 1);
  }

  function skip() {
    if (!current.optional) return;
    toast.message("Skipped optional step");
    setStep(step + 1);
  }

  return (
    <div className="min-h-dvh bg-background arc-bg">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <p className="text-sm text-foreground-muted">
          Step {step + 1} of {steps.length}
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
                <Field
                  label="Full name"
                  value={String(data.fullName ?? "")}
                  onChange={(fullName) => autosave({ fullName })}
                />
                <Field label="Email" value={String(data.email ?? "")} onChange={(email) => autosave({ email })} />
                <Field label="Location" value={String(data.location ?? "")} onChange={(location) => autosave({ location })} />
                <Field label="Phone" value={String(data.phone ?? "")} onChange={(phone) => autosave({ phone })} />
                <Field label="GitHub" value={String(data.github ?? "")} onChange={(github) => autosave({ github })} />
                <Field
                  label="Portfolio"
                  value={String(data.portfolio ?? "")}
                  onChange={(portfolio) => autosave({ portfolio })}
                />
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <Button type="button" variant="secondary" onClick={() => toast.success("Resume upload queued")}>
                  Upload resume
                </Button>
                <Button type="button" variant="outline" disabled aria-disabled>
                  Import LinkedIn (coming soon)
                </Button>
                <p className="text-xs text-foreground-muted">LinkedIn import is adapter-ready and disabled in this demo.</p>
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
                <p>
                  <span className="text-foreground-muted">Name:</span> {summary.name}
                </p>
                <p>
                  <span className="text-foreground-muted">Goal:</span> {summary.goal}
                </p>
                <p>
                  <span className="text-foreground-muted">Roles:</span>{" "}
                  {summary.roles.length ? summary.roles.join(", ") : "None selected"}
                </p>
                <p>
                  <span className="text-foreground-muted">Profile:</span> {summary.level} · {summary.length}
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
              <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>
                Back
              </Button>
              <div className="flex flex-wrap gap-2">
                {current.optional ? (
                  <Button type="button" variant="secondary" onClick={skip}>
                    Skip
                  </Button>
                ) : null}
                <Button type="button" onClick={next}>
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
