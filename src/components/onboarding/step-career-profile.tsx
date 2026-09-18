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
  const projects = form.projects.filter((row) => row.name?.trim()).length;
  const skills = form.skills.length;
  const education = form.education.filter((row) => row.school?.trim() || row.degree?.trim()).length;
  const certs = form.certifications.filter((row) => row.name?.trim()).length;
  const publications = form.publications.filter((row) => row.title?.trim()).length;
  const parts = [
    roles ? `${roles} role${roles === 1 ? "" : "s"}` : null,
    projects ? `${projects} project${projects === 1 ? "" : "s"}` : null,
    education ? `${education} education entr${education === 1 ? "y" : "ies"}` : null,
    skills ? `${skills} skill${skills === 1 ? "" : "s"}` : null,
    certs ? `${certs} certification${certs === 1 ? "" : "s"}` : null,
    publications ? `${publications} publication${publications === 1 ? "" : "s"}` : null,
  ].filter(Boolean);
  const confidenceNote =
    form.lowConfidenceCount > 0
      ? ` ${form.lowConfidenceCount} field${form.lowConfidenceCount === 1 ? "" : "s"} need review.`
      : "";
  if (!parts.length) return `We imported your résumé — review and edit anything that looks off.${confidenceNote}`;
  return `We imported your résumé: ${parts.join(", ")}.${confidenceNote}`;
}

function ambiguousClass(ambiguous: boolean): string {
  return ambiguous ? "ring-1 ring-amber-500/60 bg-amber-500/5" : "";
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
                ? "This PDF appears to contain scanned images. OCR is not available in this release. Upload a text-based PDF or DOCX, or enter your details manually."
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
        <div className="space-y-4" data-testid="import-review-sections">
          {uploadReviewMode && form.employment.length > 0 ? (
            <div className="space-y-2" data-testid="imported-employment-cards">
              <p className="text-sm font-medium">Imported roles</p>
              {form.employment.map((job, index) => (
                <div key={index} className="rounded-md border border-border px-3 py-2 text-sm">
                  <p className="font-medium" data-testid={`imported-role-title-${index}`}>
                    {[job.title, job.company].filter(Boolean).join(" · ") || `Role ${index + 1}`}
                  </p>
                  {(job.startDate || job.endDate) && (
                    <p className="text-xs text-foreground-muted">
                      {[job.startDate, job.endDate].filter(Boolean).join(" – ")}
                    </p>
                  )}
                  {job.bullets?.length ? (
                    <ul className="mt-1 list-disc pl-4 text-xs text-foreground-secondary">
                      {job.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <details open className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Contact</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className={`space-y-1.5 sm:col-span-2 ${ambiguousClass(uploadReviewMode && !form.fullName.trim())}`}>
                <Label htmlFor="full-name">Full name</Label>
                <Input
                  id="full-name"
                  value={form.fullName}
                  onChange={(e) => onChange({ fullName: e.target.value })}
                  aria-invalid={Boolean(errors.fullName)}
                  data-testid="imported-full-name"
                />
              </div>
              <div className={`space-y-1.5 ${ambiguousClass(uploadReviewMode && !form.email.trim())}`}>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => onChange({ email: e.target.value })}
                  data-testid="imported-email"
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
              <div className="space-y-1.5">
                <Label htmlFor="linkedin">LinkedIn</Label>
                <Input id="linkedin" value={form.linkedIn} onChange={(e) => onChange({ linkedIn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="github">GitHub</Label>
                <Input id="github" value={form.github} onChange={(e) => onChange({ github: e.target.value })} />
              </div>
            </div>
          </details>

          {(form.summary.trim() || form.careerProfileMode === "manual") ? (
            <details open={Boolean(form.summary.trim())} className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Summary</summary>
              <Textarea
                className="mt-3"
                aria-label="Professional summary"
                value={form.summary}
                onChange={(e) => onChange({ summary: e.target.value })}
              />
            </details>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
              <p className="text-sm text-foreground-muted">No summary imported</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ summary: " " })}>
                Add
              </Button>
            </div>
          )}

          <details open={form.employment.length > 0 || form.careerProfileMode === "manual"} className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Professional experience</summary>
            <div className="mt-3 space-y-3">
              {form.employment.length === 0 ? (
                <p className="text-sm text-foreground-muted" data-testid="no-employment-imported">
                  No employment history was found. You can continue with projects, education, and skills.
                </p>
              ) : null}
              {form.employment.map((job, index) => (
                <div
                  key={index}
                  className={`space-y-2 border-b border-border pb-3 last:border-0 ${ambiguousClass(!job.title || !job.company)}`}
                >
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
                        bullets: e.target.value.split("\n"),
                      };
                      onChange({ employment });
                    }}
                  />
                </div>
              ))}
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
          </details>

          {(form.projects.length > 0 || form.careerProfileMode === "manual") ? (
            <details open={form.projects.length > 0} className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Projects</summary>
              <div className="mt-3 space-y-3">
                {form.projects.map((project, index) => (
                  <div key={index} className="space-y-2 border-b border-border pb-3 last:border-0">
                    <Input
                      aria-label={`Project name ${index + 1}`}
                      value={project.name ?? ""}
                      data-testid={`imported-project-${index}`}
                      onChange={(e) => {
                        const projects = [...form.projects];
                        projects[index] = { ...project, name: e.target.value };
                        onChange({ projects });
                      }}
                    />
                    <Textarea
                      aria-label={`Project bullets ${index + 1}`}
                      value={(project.bullets ?? []).join("\n")}
                      onChange={(e) => {
                        const projects = [...form.projects];
                        projects[index] = { ...project, bullets: e.target.value.split("\n") };
                        onChange({ projects });
                      }}
                    />
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange({ projects: [...form.projects, { name: "", bullets: [], technologies: [] }] })}
                >
                  Add project
                </Button>
              </div>
            </details>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
              <p className="text-sm text-foreground-muted">No projects imported</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange({ projects: [{ name: "", bullets: [], technologies: [] }] })}
              >
                Add
              </Button>
            </div>
          )}

          <details open={form.education.length > 0} className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Education</summary>
            <div className="mt-3 space-y-3">
              {form.education.map((row, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2">
                  <Input
                    aria-label={`School ${index + 1}`}
                    value={row.school ?? ""}
                    data-testid={`imported-education-${index}`}
                    onChange={(e) => {
                      const education = [...form.education];
                      education[index] = { ...row, school: e.target.value };
                      onChange({ education });
                    }}
                  />
                  <Input
                    aria-label={`Degree ${index + 1}`}
                    value={row.degree ?? ""}
                    onChange={(e) => {
                      const education = [...form.education];
                      education[index] = { ...row, degree: e.target.value };
                      onChange({ education });
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange({ education: [...form.education, { school: "", degree: "" }] })}
              >
                Add education
              </Button>
            </div>
          </details>

          <details open={form.skills.length > 0 || form.careerProfileMode === "manual"} className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Skills</summary>
            <div className="mt-3">
              <ChipInput
                id="skills"
                label="Skills"
                values={form.skills}
                onChange={(skills) => onChange({ skills })}
                placeholder="Add a skill"
                error={errors.skills}
              />
            </div>
          </details>

          {(form.certifications.length > 0 || form.careerProfileMode === "manual") ? (
            <details open={form.certifications.length > 0} className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Certifications</summary>
              <div className="mt-3 space-y-2">
                {form.certifications.map((cert, index) => (
                  <Input
                    key={index}
                    aria-label={`Certification ${index + 1}`}
                    value={cert.name}
                    data-testid={`imported-cert-${index}`}
                    onChange={(e) => {
                      const certifications = [...form.certifications];
                      certifications[index] = { ...cert, name: e.target.value };
                      onChange({ certifications });
                    }}
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange({ certifications: [...form.certifications, { name: "" }] })}
                >
                  Add certification
                </Button>
              </div>
            </details>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
              <p className="text-sm text-foreground-muted">No certifications imported</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange({ certifications: [{ name: "" }] })}
              >
                Add
              </Button>
            </div>
          )}

          {(form.publications.length > 0 || form.careerProfileMode === "manual") ? (
            <details open={form.publications.length > 0} className="rounded-md border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Publications</summary>
              <div className="mt-3 space-y-2">
                {form.publications.map((pub, index) => (
                  <Input
                    key={index}
                    aria-label={`Publication ${index + 1}`}
                    value={pub.title ?? ""}
                    data-testid={`imported-publication-${index}`}
                    onChange={(e) => {
                      const publications = [...form.publications];
                      publications[index] = { ...pub, title: e.target.value };
                      onChange({ publications });
                    }}
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onChange({ publications: [...form.publications, { title: "" }] })}
                >
                  Add publication
                </Button>
              </div>
            </details>
          ) : (
            <div className="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2">
              <p className="text-sm text-foreground-muted">No publications imported</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange({ publications: [{ title: "" }] })}
              >
                Add
              </Button>
            </div>
          )}

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
