"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { CareerSections } from "./career-sections";
import { ChipInput } from "./chip-input";
import type { OnboardingFormState } from "./types";

type Props = {
  form: OnboardingFormState;
  disabled?: boolean;
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
  disabled = false,
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
    <fieldset disabled={disabled || analyzing || uploading} className="space-y-6">
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
          <details open className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Contact</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className={`space-y-1.5 sm:col-span-2 ${ambiguousClass(uploadReviewMode && !form.fullName.trim())}`}>
                <Label htmlFor="full-name">Full name</Label>
                <Input
                  id="full-name"
                  required
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
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => onChange({ email: e.target.value })}
                  data-testid="imported-email"
                  aria-invalid={Boolean(errors.email)}
                />
              </div>
              <div className={`space-y-1.5 ${ambiguousClass(uploadReviewMode && !form.phone.trim())}`}>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => onChange({ phone: e.target.value })}
                  data-testid="imported-phone"
                  aria-invalid={Boolean(errors.phone)}
                />
              </div>
              <div className={`space-y-1.5 sm:col-span-2 ${ambiguousClass(uploadReviewMode && !form.location.trim())}`}>
                <Label htmlFor="location">Current location</Label>
                <Input
                  id="location"
                  required
                  value={form.location}
                  onChange={(e) => onChange({ location: e.target.value })}
                  placeholder="City, region, country"
                  data-testid="imported-location"
                  aria-invalid={Boolean(errors.location)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="linkedin">LinkedIn (optional)</Label>
                <Input id="linkedin" value={form.linkedIn} onChange={(e) => onChange({ linkedIn: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="github">GitHub (optional)</Label>
                <Input id="github" value={form.github} onChange={(e) => onChange({ github: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="portfolio">Portfolio / personal website (optional)</Label>
                <Input
                  id="portfolio"
                  value={form.portfolio}
                  onChange={(e) => onChange({ portfolio: e.target.value })}
                  data-testid="imported-portfolio"
                />
              </div>
            </div>
          </details>

          <details open={Boolean(form.summary.trim()) || form.careerProfileMode === "manual"} className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Professional summary (optional)</summary>
            <Textarea className="mt-3" aria-label="Professional summary" value={form.summary} onChange={(event) => onChange({ summary: event.target.value })} />
          </details>
          <CareerSections form={form} onChange={onChange} />
          <details open={form.skills.length > 0 || form.careerProfileMode === "manual"} className="rounded-md border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Skills</summary>
            <div className="mt-3">
              <ChipInput id="skills" label="Skills" values={form.skills} onChange={(skills) => onChange({ skills })} placeholder="Add a skill" error={errors.skills} />
            </div>
          </details>

          {errors.career ? (
            <p className="text-sm text-destructive" role="alert">
              {errors.career}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
