"use client";

import { useState, type ReactNode } from "react";
import { BriefcaseBusiness, GraduationCap, Grid2X2, Award, BookOpen, ChevronDown } from "lucide-react";
import { CareerSections, type SectionKey } from "./career-sections";
import type { OnboardingFormState } from "./types";

const sections = [
  { key: "employment", title: "Experience", noun: "role", icon: BriefcaseBusiness, empty: { title: "", company: "", bullets: [] } },
  { key: "education", title: "Education", noun: "entry", icon: GraduationCap, empty: { school: "", degree: "", field: "" } },
  { key: "projects", title: "Projects", noun: "project", icon: Grid2X2, empty: { name: "", bullets: [], technologies: [] } },
  { key: "certifications", title: "Certifications", noun: "certification", icon: Award, empty: { name: "" } },
  { key: "publications", title: "Publications", noun: "publication", icon: BookOpen, empty: { title: "", authors: [] } },
] satisfies Array<{ key: SectionKey; title: string; noun: string; icon: typeof BookOpen; empty: Record<string, unknown> }>;

export function CareerReview({ form, onChange }: { form: OnboardingFormState; onChange: (patch: Partial<OnboardingFormState>) => void }) {
  return sections.map(({ key, title, noun, icon: Icon, empty }) => {
    const rows = form[key] as Array<Record<string, unknown>>;
    return <details key={key} className="focus-review-section" open={key === "employment"}>
      <summary><Icon size={22} aria-hidden /><strong>{title}</strong><span>{rows.length} {rows.length === 1 ? noun : noun === "entry" ? "entries" : `${noun}s`}</span><ChevronDown size={19} aria-hidden /></summary>
      <div className="focus-review-records">
        {rows.map((row, index) => {
          const heading = String(row.title || row.name || row.school || `${noun} ${index + 1}`);
          const context = [row.company || row.organization || row.degree || row.issuer || row.publisher, row.location].filter(Boolean).join(" · ");
          const dates = [row.startDate || row.date || row.publicationDate, row.isCurrent ? "Present" : row.endDate].filter(Boolean).join(" – ");
          return <details key={index} className="focus-review-record" open={index === 0}>
            <summary><div><strong>{heading}</strong>{context && <p>{context}</p>}{dates && <p>{dates}</p>}</div><ChevronDown size={17} aria-hidden /></summary>
            {row.field ? <p>{String(row.field)}</p> : null}
            {row.description ? <p>{String(row.description)}</p> : null}
            {Array.isArray(row.bullets) && row.bullets.length > 0 && <ul>{row.bullets.map((bullet, n) => <li key={n}>{String(bullet)}</li>)}</ul>}
            <RecordEditor initiallyOpen={!row.title && !row.name && !row.school} label={`Edit ${noun === "entry" ? "education" : noun} ${index + 1}`}>
              <CareerSections form={form} onChange={onChange} sectionKeys={[key]} onlyIndex={index} />
            </RecordEditor>
          </details>;
        })}
        {!rows.length && <p className="text-sm text-foreground-secondary">No {title.toLowerCase()} added. Add only what applies to you.</p>}
        <button type="button" className="focus-add-record" onClick={() => onChange({ [key]: [...rows, { ...empty }] })}>Add {noun === "entry" ? "education" : noun}</button>
      </div>
    </details>;
  });
}

function RecordEditor({ initiallyOpen, label, children }: { initiallyOpen: boolean; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return <details className="career-review-editor" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}><summary>{label}</summary>{children}</details>;
}
