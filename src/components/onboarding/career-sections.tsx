"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { OnboardingFormState } from "./types";

export type SectionKey = "employment" | "education" | "projects" | "certifications" | "publications";
type Field = { key: string; label: string; kind?: "lines" | "list" | "boolean" | "description"; testId?: string };
type Section = { key: SectionKey; title: string; singular: string; empty: Record<string, unknown>; fields: Field[] };

const sections: Section[] = [
  { key: "employment", title: "Professional experience", singular: "role", empty: { title: "", company: "", bullets: [] }, fields: [
    { key: "title", label: "Job title" }, { key: "company", label: "Employer" },
    { key: "location", label: "Employment location" }, { key: "startDate", label: "Employment start date" },
    { key: "endDate", label: "Employment end date" }, { key: "isCurrent", label: "I currently work here", kind: "boolean" },
    { key: "bullets", label: "Bullets", kind: "lines" }, { key: "technologies", label: "Role technologies", kind: "list" },
  ] },
  { key: "projects", title: "Projects", singular: "project", empty: { name: "", bullets: [], technologies: [] }, fields: [
    { key: "name", label: "Project name", testId: "imported-project" }, { key: "role", label: "Project role" },
    { key: "organization", label: "Project organization" }, { key: "startDate", label: "Project start date" },
    { key: "endDate", label: "Project end date" }, { key: "description", label: "Project description", kind: "description" },
    { key: "bullets", label: "Project bullets", kind: "lines" }, { key: "technologies", label: "Project technologies", kind: "list" },
    { key: "url", label: "Project URL" }, { key: "repoUrl", label: "Repository URL" },
  ] },
  { key: "education", title: "Education", singular: "education", empty: { school: "", degree: "", field: "" }, fields: [
    { key: "school", label: "Institution", testId: "imported-education" },
    { key: "degree", label: "Degree", testId: "imported-education-degree" },
    { key: "field", label: "Field of study", testId: "imported-education-field" },
    { key: "location", label: "Education location", testId: "imported-education-location" },
    { key: "startDate", label: "Education start date" }, { key: "endDate", label: "Graduation date" },
    { key: "gpa", label: "GPA (optional)" }, { key: "honors", label: "Honors (optional)" },
  ] },
  { key: "certifications", title: "Certifications", singular: "certification", empty: { name: "" }, fields: [
    { key: "name", label: "Certification", testId: "imported-cert" }, { key: "issuer", label: "Issuer" },
    { key: "date", label: "Issue date" }, { key: "expirationDate", label: "Expiration date" },
    { key: "credentialId", label: "Credential ID" }, { key: "credentialUrl", label: "Credential URL" },
  ] },
  { key: "publications", title: "Publications", singular: "publication", empty: { title: "", authors: [] }, fields: [
    { key: "title", label: "Publication", testId: "imported-publication" }, { key: "authors", label: "Authors", kind: "list" },
    { key: "publisher", label: "Publisher" }, { key: "publicationDate", label: "Publication date" },
    { key: "doi", label: "DOI" }, { key: "url", label: "Publication URL" }, { key: "description", label: "Publication description", kind: "description" },
  ] },
];

export function useCareerRemoval(form: OnboardingFormState, onChange: (patch: Partial<OnboardingFormState>) => void) {
  const [removed, setRemoved] = useState<{ section: SectionKey; index: number; row: Record<string, unknown> } | null>(null);
  function remove(section: SectionKey, index: number) {
    const rows = form[section] as Array<Record<string, unknown>>;
    setRemoved({ section, index, row: rows[index] });
    onChange({ [section]: rows.filter((_, i) => i !== index) });
  }
  const undo = removed ? <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 p-3 text-sm">
    <span>Entry removed.</span>
    <Button type="button" size="sm" variant="secondary" onClick={() => {
      const rows = [...form[removed.section]];
      rows.splice(Math.min(removed.index, rows.length), 0, removed.row);
      onChange({ [removed.section]: rows });
      setRemoved(null);
    }}>Undo</Button>
  </div> : null;
  return { remove, undo };
}

export function CareerSections({ form, onChange, sectionKeys, onlyIndex, framed = true, onRemove }: {
  form: OnboardingFormState;
  sectionKeys?: SectionKey[];
  onlyIndex?: number;
  framed?: boolean;
  onRemove?: (section: SectionKey, index: number) => void;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}) {
  const prefix = useId();
  const removal = useCareerRemoval(form, onChange);
  return <>{sections.filter((section) => !sectionKeys || sectionKeys.includes(section.key)).map((section) => {
    const rows = form[section.key] as Array<Record<string, unknown>>;
    function update(index: number, field: string, value: unknown) {
      onChange({ [section.key]: rows.map((row, i) => i === index ? { ...row, [field]: value } : row) });
    }
    const content = (
        <div className="mt-3 space-y-4">
          {!rows.length ? <p className="text-sm text-foreground-secondary">No {section.title.toLowerCase()} added. Add only what applies to you.</p> : null}
          {rows.map((row, index) => onlyIndex !== undefined && index !== onlyIndex ? null : (
            <fieldset key={index} className="grid gap-3 border-b border-border pb-4 last:border-0 sm:grid-cols-2">
              <legend className="mb-3 text-sm font-medium" data-testid={section.key === "employment" ? `imported-role-title-${index}` : undefined}>
                {section.key === "employment" ? [row.title, row.company].filter(Boolean).join(" · ") || `Role ${index + 1}` : String(row.school || row.name || row.title || `New ${section.singular}`)}
              </legend>
              {section.fields.map((field) => {
                const id = `${prefix}-${section.key}-${index}-${field.key}`;
                const label = `${field.label} ${index + 1}`;
                const value = row[field.key];
                if (field.kind === "boolean") return (
                  <label key={field.key} htmlFor={id} className="flex items-center gap-2 text-sm">
                    <input id={id} type="checkbox" checked={Boolean(value)} aria-label={label} onChange={(event) => {
                      const current = event.target.checked;
                      onChange({ [section.key]: rows.map((item, i) => i === index ? { ...item, isCurrent: current, endDate: current ? "Present" : "" } : item) });
                    }} />{field.label}
                  </label>
                );
                // Preserve the exact text while typing; normalization belongs to the save payload.
                const text = Array.isArray(value) ? value.join(field.kind === "lines" ? "\n" : ",") : String(value ?? "");
                const change = (next: string) => update(index, field.key, field.kind === "lines" ? next.split("\n") : field.kind === "list" ? next.split(",") : next);
                const dateField = /date$/i.test(field.key);
                const urlField = /url$/i.test(field.key);
                return (
                  <div key={field.key} className={`space-y-1.5 ${field.kind ? "sm:col-span-2" : ""}`}>
                    <Label htmlFor={id}>{field.label}</Label>
                    {field.kind === "lines" || field.kind === "description" ? (
                      <Textarea id={id} aria-label={label} value={text} onChange={(event) => change(event.target.value)} />
                    ) : (
                      <Input id={id} aria-label={label} value={text} inputMode={urlField ? "url" : undefined} autoCapitalize={urlField ? "none" : undefined} spellCheck={urlField ? false : undefined} placeholder={dateField ? "e.g. Jan 2024" : undefined} aria-describedby={dateField ? `${id}-hint` : undefined} data-testid={field.testId ? `${field.testId}-${index}` : undefined} disabled={field.key === "endDate" && row.isCurrent === true} onChange={(event) => change(event.target.value)} />
                    )}
                    {dateField && <p id={`${id}-hint`} className="text-xs text-foreground-muted">Month and year, or year only if that is all you know.</p>}
                    {field.kind === "list" ? <p className="text-xs text-foreground-muted">Separate items with commas.</p> : null}
                  </div>
                );
              })}
              <Button type="button" size="sm" variant="ghost" className="justify-self-start" aria-label={`Remove ${section.singular} ${index + 1}`} onClick={() => (onRemove ?? removal.remove)(section.key, index)}>Remove {section.singular}</Button>
            </fieldset>
          ))}
          {onlyIndex === undefined && <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ [section.key]: [...rows, { ...section.empty }] })}>Add {section.singular}</Button>}
        </div>
    );
    return framed ? <details key={section.key} open={rows.length > 0 || form.careerProfileMode === "manual"} className="rounded-md border border-border p-3" data-testid={section.key === "employment" ? "imported-employment-cards" : undefined}>
      <summary className="cursor-pointer text-sm font-medium">{section.title} <span className="text-foreground-muted">({rows.length})</span></summary>
      {content}
    </details> : <div key={section.key}>{content}</div>;
  })}{!onRemove && removal.undo}</>;
}
