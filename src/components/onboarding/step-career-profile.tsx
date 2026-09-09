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
  onRetryImport?: () => void;
  statusMessage: string | null;
  importErrorCode?: string | null;
};

function statusLabel(status: string | null): string {
  switch (status) {
    case "pending_scan":
      return "Security scanning…";
    case "scan_clean":
      return "Reading résumé…";
    case "extracting":
      return "Structuring career details…";
    case "ready_for_review":
      return "Import ready — review below, then Continue";
    case "confirmed":
      return "Career profile confirmed";
    case "failed":
      return "We couldn’t read that file.";
    default:
      return "";
  }
}

function importSummary(form: OnboardingFormState): string {
  const roles = form.employment.filter((row) => row.title?.trim() || row.company?.trim()).length;
  const skills = form.skills.length;
  const education = form.education.filter((row) => row.school?.trim() || row.degree?.trim()).length;
  const certs = form.certifications.filter((row) => row.name?.trim()).length;
  const parts = [
    roles ? `${roles} role${roles === 1 ? "" : "s"}` : null,
    skills ? `${skills} skill${skills === 1 ? "" : "s"}` : null,
    education ? `${education} education entr${education === 1 ? "y" : "ies"}` : null,
    certs ? `${certs} certification${certs === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  if (!parts.length) return "We extracted some details — review and edit anything that looks off.";
  return `Imported ${parts.join(", ")}.`;
}

export function StepCareerProfile({
  form,
  onChange,
  errors,
  importStatus,
  uploading,
  onUpload,
  onRetryImport,
  statusMessage,
  importErrorCode,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const analyzing = ["pending_scan", "scan_clean", "extracting"].includes(importStatus ?? "");
  const showReview =
    form.careerProfileMode === "manual" ||
    importStatus === "ready_for_review" ||
    importStatus === "confirmed";
  const uploadReviewMode = importStatus === "ready_for_review" || importStatus === "confirmed";

  const imageOnly = importErrorCode === "IMAGE_ONLY_PDF_OCR_REQUIRED";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          className={
            form.careerProfileMode === "upload"
              ? "rounded-md border border-accent bg-accent/10 p-4 text-left"
              : "rounded-md border border-border-strong bg-surface p-4 text-left hover:bg-surface-2"
          }
          onClick={() => onChange({ careerProfileMode: "upload" })}
        >
          <p className="text-sm font-medium">Upload a resume</p>
          <p className="mt-1 text-xs text-foreground-muted">
            PDF or DOCX up to 10 MB / 30 pages. We’ll extract what we can for you to review.
          </p>
        </button>
        <button
          type="button"
          className={
            form.careerProfileMode === "manual"
              ? "rounded-md border border-accent bg-accent/10 p-4 text-left"
              : "rounded-md border border-border-strong bg-surface p-4 text-left hover:bg-surface-2"
          }
          onClick={() => onChange({ careerProfileMode: "manual" })}
        >
          <p className="text-sm font-medium">Enter manually</p>
          <p className="mt-1 text-xs text-foreground-muted">Add contact details, roles, and skills yourself.</p>
        </button>
      </div>

      {form.careerProfileMode === "upload" ? (
        <div className="space-y-3 rounded-md border border-border bg-surface p-4">
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
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={uploading || analyzing}
              onClick={() => fileRef.current?.click()}
            >
              {uploading
                ? "Uploading…"
                : analyzing
                  ? "Working…"
                  : importStatus
                    ? "Replace file"
                    : "Choose PDF or DOCX"}
            </Button>
            {importStatus === "failed" && onRetryImport ? (
              <Button type="button" variant="secondary" onClick={onRetryImport}>
                Retry
              </Button>
            ) : null}
          </div>
          <p className="text-sm text-foreground-secondary" aria-live="polite">
            {statusMessage || statusLabel(importStatus)}
          </p>
          {analyzing ? (
            <ol className="grid gap-1 text-xs text-foreground-muted sm:grid-cols-4" aria-label="Import progress">
              <li className={uploading || importStatus ? "text-foreground" : ""}>Uploading</li>
              <li className={importStatus === "pending_scan" ? "text-foreground" : ""}>Security scanning</li>
              <li
                className={
                  importStatus === "scan_clean" || importStatus === "extracting" ? "text-foreground" : ""
                }
              >
                Reading résumé
              </li>
              <li className={importStatus === "extracting" ? "text-foreground" : ""}>Structuring details</li>
            </ol>
          ) : null}
          {importStatus === "failed" ? (
            <p className="text-sm text-destructive" role="alert">
              {imageOnly
                ? "This PDF appears to contain scanned images. Upload a text-based PDF or DOCX, or enter your details manually."
                : statusMessage || "Try another PDF/DOCX or enter details manually."}
            </p>
          ) : null}
          {uploadReviewMode ? (
            <p className="text-sm font-medium text-foreground" data-testid="import-summary">
              {importSummary(form)}
            </p>
          ) : null}
        </div>
      ) : null}

      {showReview ? (
        <div className="space-y-4">
          {uploadReviewMode && form.employment.length > 0 ? (
            <div className="space-y-2" data-testid="imported-employment-cards">
              <p className="text-sm font-medium">Imported roles</p>
              {form.employment.map((job, index) => (
                <div key={index} className="rounded-md border border-border px-3 py-2 text-sm">
                  <p className="font-medium">
                    {[job.title, job.company].filter(Boolean).join(" · ") || `Role ${index + 1}`}
                  </p>
                  {(job.startDate || job.endDate) && (
                    <p className="text-xs text-foreground-muted">
                      {[job.startDate, job.endDate].filter(Boolean).join(" – ")}
                    </p>
                  )}
                  {job.bullets?.length ? (
                    <ul className="mt-1 list-disc pl-4 text-xs text-foreground-secondary">
                      {job.bullets.slice(0, 3).map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
              <p className="text-xs text-foreground-muted">Edit any field below if something looks wrong.</p>
            </div>
          ) : null}

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

          {form.careerProfileMode === "manual" ? (
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
                <p className="text-sm text-foreground-muted">
                  Optional if you have skills, education, or projects. Students and career changers can continue
                  without employment history.
                </p>
              ) : null}
              {form.employment.map((job, index) => (
                <div key={index} className="space-y-2 rounded-md border border-border p-3">
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
                  </div>
                  <Textarea
                    aria-label={`Bullets ${index + 1}`}
                    placeholder="One achievement per line"
                    value={(job.bullets ?? []).join("\n")}
                    onChange={(e) => {
                      const employment = [...form.employment];
                      employment[index] = {
                        ...job,
                        bullets: e.target.value.split("\n").filter(Boolean),
                      };
                      onChange({ employment });
                    }}
                  />
                </div>
              ))}
            </div>
          ) : form.employment.length > 0 ? (
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Edit employment fields</summary>
              <div className="mt-3 space-y-3">
                {form.employment.map((job, index) => (
                  <div key={index} className="space-y-2 border-b border-border pb-3 last:border-0">
                    <Input
                      aria-label={`Job title ${index + 1}`}
                      value={job.title ?? ""}
                      onChange={(e) => {
                        const employment = [...form.employment];
                        employment[index] = { ...job, title: e.target.value };
                        onChange({ employment });
                      }}
                    />
                    <Input
                      aria-label={`Employer ${index + 1}`}
                      value={job.company ?? ""}
                      onChange={(e) => {
                        const employment = [...form.employment];
                        employment[index] = { ...job, company: e.target.value };
                        onChange({ employment });
                      }}
                    />
                    <Textarea
                      aria-label={`Bullets ${index + 1}`}
                      value={(job.bullets ?? []).join("\n")}
                      onChange={(e) => {
                        const employment = [...form.employment];
                        employment[index] = {
                          ...job,
                          bullets: e.target.value.split("\n").filter(Boolean),
                        };
                        onChange({ employment });
                      }}
                    />
                  </div>
                ))}
              </div>
            </details>
          ) : uploadReviewMode ? (
            <p className="text-sm text-foreground-muted" data-testid="no-employment-imported">
              No employment history was found. You can continue with projects, education, and skills, or add a role
              under Enter manually.
            </p>
          ) : null}

          {errors.career ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.career}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
