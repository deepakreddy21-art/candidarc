"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/feedback";
import { api } from "@/services/api";
import { evidenceItems } from "@/data/seed";
import { cn } from "@/lib/utils";

const steps = [
  "Job information",
  "Career profile",
  "Research depth",
  "Evidence controls",
  "Confirmation",
] as const;

export function NewApplicationFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    url: "",
    rawText: "",
    company: "",
    role: "",
    location: "United States",
    deadline: "",
    source: "Company careers",
    profile: "master",
    length: "one-page",
    experience: "experienced",
    researchDepth: "standard",
    excludeEvidence: [] as string[],
  });

  const progress = ((step + 1) / steps.length) * 100;

  const summary = useMemo(
    () => ({
      role: form.role || "Untitled role",
      company: form.company || "Company",
      research:
        form.researchDepth === "standard"
          ? "Standard role research"
          : form.researchDepth === "deep"
            ? "Deep team and project research"
            : "Deep research plus interview intelligence",
      length: form.length,
    }),
    [form],
  );

  function extractFromUrl() {
    if (!form.url.trim()) {
      toast.error("Paste a job URL first");
      return;
    }
    toast.message("Paste the job description below", {
      description: "The server will collect the public job URL when research starts.",
    });
  }

  async function submit() {
    if (!form.company.trim() || !form.role.trim()) {
      toast.error("Company and role are required");
      setStep(0);
      return;
    }
    setSubmitting(true);
    try {
      const app = await api.createApplication({
        company: form.company,
        role: form.role,
        location: form.location,
        deadline: form.deadline || undefined,
        jobUrl: form.url || undefined,
        jobDescriptionText: form.rawText || undefined,
        researchDepth: form.researchDepth,
        excludedEvidenceIds: form.excludeEvidence,
        resumeLength: form.length,
        experienceLevel: form.experience,
      });
      toast.success("Role research started");
      router.push(`/app/opportunities/${app.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create application");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <p className="text-sm text-foreground-muted">
          Step {step + 1} of {steps.length}
        </p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight sm:text-[32px]">{steps[step]}</h1>
        <ProgressBar value={progress} className="mt-4" />
      </div>

      <Card>
        <CardContent className="space-y-5 p-5 sm:p-6">
          {step === 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="job-url">Job URL</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="job-url"
                    placeholder="https://jobs.example.com/role"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                  />
                  <Button type="button" variant="secondary" onClick={extractFromUrl}>
                    Use URL
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jd">Paste job description</Label>
                <Textarea
                  id="jd"
                  value={form.rawText}
                  onChange={(e) => setForm({ ...form, rawText: e.target.value })}
                  placeholder="Paste the full posting…"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Company" value={form.company} onChange={(company) => setForm({ ...form, company })} required />
                <Field label="Role title" value={form.role} onChange={(role) => setForm({ ...form, role })} required />
                <Field label="Location" value={form.location} onChange={(location) => setForm({ ...form, location })} />
                <Field label="Deadline" value={form.deadline} onChange={(deadline) => setForm({ ...form, deadline })} type="date" />
                <Field label="Source" value={form.source} onChange={(source) => setForm({ ...form, source })} />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-3">
              {[
                { id: "master", title: "Master career profile", desc: "Primary Career Truth profile" },
                { id: "existing", title: "Existing resume", desc: "Use a prior opportunity resume as a starting point" },
                { id: "persona", title: "Target persona", desc: "CX AI Software Engineer focus" },
              ].map((opt) => (
                <Choice
                  key={opt.id}
                  active={form.profile === opt.id}
                  title={opt.title}
                  description={opt.desc}
                  onClick={() => setForm({ ...form, profile: opt.id })}
                />
              ))}
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  active={form.length === "one-page"}
                  title="One-page"
                  description="Preferred for most roles"
                  onClick={() => setForm({ ...form, length: "one-page" })}
                />
                <Choice
                  active={form.length === "two-page"}
                  title="Two-page"
                  description="When depth requires space"
                  onClick={() => setForm({ ...form, length: "two-page" })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {["student", "early-career", "experienced", "career-transition"].map((level) => (
                  <Choice
                    key={level}
                    active={form.experience === level}
                    title={level.replace("-", " ")}
                    description="Profile posture for generation"
                    onClick={() => setForm({ ...form, experience: level })}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="grid gap-3">
              {[
                { id: "standard", title: "Standard", desc: "Role requirements, tech signals, and hiring themes." },
                { id: "deep", title: "Deep team and project research", desc: "Company, team, and adjacent project signals with source confidence." },
                {
                  id: "interview",
                  title: "Deep research plus interview intelligence",
                  desc: "Adds likely interview themes and resume-defense prompts from the final draft.",
                },
              ].map((opt) => (
                <Choice
                  key={opt.id}
                  active={form.researchDepth === opt.id}
                  title={opt.title}
                  description={opt.desc}
                  onClick={() => setForm({ ...form, researchDepth: opt.id })}
                />
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <CardHeader className="p-0">
                <CardTitle>Evidence controls</CardTitle>
                <CardDescription>Matched items are ready. Exclude anything you never want used.</CardDescription>
              </CardHeader>
              <div className="space-y-2">
                {evidenceItems.slice(0, 5).map((ev) => {
                  const excluded = form.excludeEvidence.includes(ev.id);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-border px-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium">{ev.title}</p>
                        <p className="text-xs text-foreground-muted">
                          {ev.confidence} confidence · {ev.verificationStatus}
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant={excluded ? "destructive" : "secondary"}
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            excludeEvidence: excluded
                              ? f.excludeEvidence.filter((id) => id !== ev.id)
                              : [...f.excludeEvidence, ev.id],
                          }))
                        }
                      >
                        {excluded ? "Excluded" : "Never use"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-2">
                <SummaryItem label="Target role" value={`${summary.company} · ${summary.role}`} />
                <SummaryItem label="Profile" value={form.profile} />
                <SummaryItem label="Research depth" value={summary.research} />
                <SummaryItem label="Resume preference" value={summary.length} />
                <SummaryItem label="Audit sequence" value="HR → EM → HR → EM → Final QA" />
                <SummaryItem label="Interview prep" value="Enabled after final version" />
              </dl>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
            {step < steps.length - 1 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 0 && (!form.company.trim() || !form.role.trim())) {
                    toast.error("Company and role are required");
                    return;
                  }
                  toast.message("Progress saved");
                  setStep((s) => s + 1);
                }}
              >
                Continue
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting ? "Starting…" : "Start role research"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} />
    </div>
  );
}

function Choice({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-4 py-3 text-left transition-colors",
        active
          ? "border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
          : "border-border hover:bg-surface-2",
      )}
    >
      <p className="text-sm font-semibold capitalize">{title}</p>
      <p className="mt-1 text-xs text-foreground-secondary">{description}</p>
    </button>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-canvas px-4 py-3">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium capitalize">{value}</dd>
    </div>
  );
}

