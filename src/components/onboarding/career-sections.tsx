"use client";

import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import type { OnboardingFormState } from "./types";

type SectionKey = "employment" | "education" | "projects" | "certifications" | "publications";
type Field = { key: string; label: string; kind?: "lines" | "list" | "boolean"; testId?: string };
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
    { key: "endDate", label: "Project end date" }, { key: "description", label: "Project description" },
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
    { key: "doi", label: "DOI" }, { key: "url", label: "Publication URL" }, { key: "description", label: "Publication description" },
  ] },
];

export function CareerSections({ form, onChange }: {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
}) {
  const prefix = useId();
  return sections.map((section) => {
    const rows = form[section.key] as Array<Record<string, unknown>>;
    function update(index: number, field: string, value: unknown) {
      onChange({ [section.key]: rows.map((row, i) => i === index ? { ...row, [field]: value } : row) });
    }
    return (
      <details key={section.key} open={rows.length > 0 || form.careerProfileMode === "manual"} className="rounded-md border border-border p-3" data-testid={section.key === "employment" ? "imported-employment-cards" : undefined}>
        <summary className="cursor-pointer text-sm font-medium">{section.title} <span className="text-foreground-muted">({rows.length})</span></summary>
        <div className="mt-3 space-y-4">
          {!rows.length ? <p className="text-sm text-foreground-secondary">No {section.title.toLowerCase()} added. Add only what applies to you.</p> : null}
          {rows.map((row, index) => (
            <fieldset key={index} className="grid gap-3 border-b border-border pb-4 last:border-0 sm:grid-cols-2">
              <legend className="mb-3 text-sm font-medium" data-testid={section.key === "employment" ? `imported-role-title-${index}` : undefined}>
                {section.key === "employment" ? [row.title, row.company].filter(Boolean).join(" · ") || `Role ${index + 1}` : `${section.singular} ${index + 1}`}
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
                const text = Array.isArray(value) ? value.join(field.kind === "lines" ? "\n" : ", ") : String(value ?? "");
                const change = (next: string) => update(index, field.key, field.kind === "lines" ? next.split("\n") : field.kind === "list" ? next.split(",").map((part) => part.trim()) : next);
                return (
                  <div key={field.key} className={`space-y-1.5 ${field.kind ? "sm:col-span-2" : ""}`}>
                    <Label htmlFor={id}>{field.label}</Label>
                    {field.kind === "lines" ? (
                      <Textarea id={id} aria-label={label} value={text} onChange={(event) => change(event.target.value)} />
                    ) : (
                      <Input id={id} aria-label={label} value={text} data-testid={field.testId ? `${field.testId}-${index}` : undefined} disabled={field.key === "endDate" && row.isCurrent === true} onChange={(event) => change(event.target.value)} />
                    )}
                    {field.kind === "list" ? <p className="text-xs text-foreground-muted">Separate items with commas.</p> : null}
                  </div>
                );
              })}
              <Button type="button" size="sm" variant="ghost" className="justify-self-start" aria-label={`Remove ${section.singular} ${index + 1}`} onClick={() => onChange({ [section.key]: rows.filter((_, i) => i !== index) })}>Remove {section.singular}</Button>
            </fieldset>
          ))}
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange({ [section.key]: [...rows, { ...section.empty }] })}>Add {section.singular}</Button>
        </div>
      </details>
    );
  });
}
