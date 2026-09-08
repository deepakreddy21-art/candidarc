"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ChipInput } from "./chip-input";
import type { OnboardingFormState } from "./types";

type Props = {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
  errors: Partial<Record<string, string>>;
  importStatus: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onConfirmImport: () => void;
  statusMessage: string | null;
};

function statusLabel(status: string | null): string {
  switch (status) {
    case "pending_scan":
    case "scan_clean":
    case "extracting":
      return "Analyzing your resume…";
    case "ready_for_review":
      return "Ready for review";
    case "confirmed":
      return "Career profile confirmed";
    case "failed":
      return "We couldn’t read that file. Try again with a PDF or DOCX.";
    default:
      return "";
  }
}

export function StepCareerProfile({
  form,
  onChange,
  errors,
  importStatus,
  uploading,
  onUpload,
  onConfirmImport,
  statusMessage,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const analyzing = ["pending_scan", "scan_clean", "extracting"].includes(importStatus ?? "");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className={
            form.careerProfileMode === "upload"
              ? "rounded-[16px] border border-accent bg-accent/10 p-4 text-left"
              : "rounded-[16px] border border-border-strong bg-surface p-4 text-left hover:bg-surface-2"
          }
          onClick={() => onChange({ careerProfileMode: "upload" })}
        >
          <p className="text-sm font-medium">Upload a resume</p>
          <p className="mt-1 text-xs text-foreground-muted">PDF or DOCX. We’ll extract what we can for you to confirm.</p>
        </button>
        <button
          type="button"
          className={
            form.careerProfileMode === "manual"
              ? "rounded-[16px] border border-accent bg-accent/10 p-4 text-left"
              : "rounded-[16px] border border-border-strong bg-surface p-4 text-left hover:bg-surface-2"
          }
          onClick={() => onChange({ careerProfileMode: "manual" })}
        >
          <p className="text-sm font-medium">Enter manually</p>
          <p className="mt-1 text-xs text-foreground-muted">Add contact details, roles, and skills yourself.</p>
        </button>
      </div>

      {form.careerProfileMode === "upload" ? (
        <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={uploading || analyzing}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : analyzing ? "Analyzing…" : importStatus ? "Replace file" : "Choose PDF or DOCX"}
          </Button>
          <p className="text-sm text-foreground-secondary" aria-live="polite">
            {statusMessage || statusLabel(importStatus)}
          </p>
          {importStatus === "ready_for_review" ? (
            <Button type="button" onClick={onConfirmImport}>
              Confirm extracted details
            </Button>
          ) : null}
          {importStatus === "failed" ? (
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              Try another file
            </Button>
          ) : null}
        </div>
      ) : null}

      {(form.careerProfileMode === "manual" ||
        importStatus === "ready_for_review" ||
        importStatus === "confirmed") && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                value={form.fullName}
                onChange={(e) => onChange({ fullName: e.target.value })}
                aria-invalid={Boolean(errors.fullName)}
              />
              {errors.fullName ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.fullName}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => onChange({ email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" value={form.phone} onChange={(e) => onChange({ phone: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="location">Location (optional)</Label>
              <Input
                id="location"
                value={form.location}
                onChange={(e) => onChange({ location: e.target.value })}
              />
            </div>
          </div>

          <ChipInput
            id="skills"
            label="Skills"
            values={form.skills}
            onChange={(skills) => onChange({ skills })}
            placeholder="Add a skill"
            error={errors.skills}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Employment</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onChange({
                    employment: [...form.employment, { title: "", company: "", bullets: [""] }],
                  })
                }
              >
                Add role
              </Button>
            </div>
            {form.employment.length === 0 ? (
              <p className="text-sm text-foreground-muted">No roles yet. Add one or upload a resume.</p>
            ) : null}
            {form.employment.map((job, index) => (
              <div key={index} className="space-y-2 rounded-[14px] border border-border p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label={`Job title ${index + 1}`}
                    placeholder="Job title"
                    value={job.title ?? ""}
                    onChange={(e) => {
                      const employment = [...form.employment];
                      employment[index] = { ...job, title: e.target.value };
                      onChange({ employment });
                    }}
                  />
                  <Input
                    aria-label={`Employer ${index + 1}`}
                    placeholder="Employer"
                    value={job.company ?? ""}
                    onChange={(e) => {
                      const employment = [...form.employment];
                      employment[index] = { ...job, company: e.target.value };
                      onChange({ employment });
                    }}
                  />
                  <Input
                    aria-label={`Start date ${index + 1}`}
                    placeholder="Start date"
                    value={job.startDate ?? ""}
                    onChange={(e) => {
                      const employment = [...form.employment];
                      employment[index] = { ...job, startDate: e.target.value };
                      onChange({ employment });
                    }}
                  />
                  <Input
                    aria-label={`End date ${index + 1}`}
                    placeholder="End date"
                    value={job.endDate ?? ""}
                    onChange={(e) => {
                      const employment = [...form.employment];
                      employment[index] = { ...job, endDate: e.target.value };
                      onChange({ employment });
                    }}
                  />
                </div>
                <Textarea
                  aria-label={`Responsibilities ${index + 1}`}
                  placeholder="Responsibilities and accomplishments (one per line)"
                  value={(job.bullets ?? []).join("\n")}
                  onChange={(e) => {
                    const employment = [...form.employment];
                    employment[index] = {
                      ...job,
                      bullets: e.target.value.split("\n").map((line) => line.trimEnd()),
                    };
                    onChange({ employment });
                  }}
                />
              </div>
            ))}
            {errors.career ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.career}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">
              Extra notes <span className="font-normal text-foreground-muted">(optional)</span>
            </Label>
            <Textarea
              id="notes"
              value={form.evidenceNotes}
              onChange={(e) => onChange({ evidenceNotes: e.target.value })}
              placeholder="Anything else CandidArc should know from your experience"
            />
          </div>
        </div>
      )}
    </div>
  );
}
