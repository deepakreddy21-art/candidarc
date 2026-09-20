"use client";

import { useState } from "react";
import { BriefcaseBusiness, GraduationCap, Grid2X2, Award, BookOpen, ChevronDown } from "lucide-react";
import { CareerSections, useCareerRemoval, type SectionKey } from "./career-sections";
import type { OnboardingFormState } from "./types";

const sections = [
  { key: "employment", title: "Experience", noun: "role", icon: BriefcaseBusiness, empty: { title: "", company: "", bullets: [] } },
  { key: "education", title: "Education", noun: "entry", icon: GraduationCap, empty: { school: "", degree: "", field: "" } },
  { key: "projects", title: "Projects", noun: "project", icon: Grid2X2, empty: { name: "", bullets: [], technologies: [] } },
  { key: "certifications", title: "Certifications", noun: "certification", icon: Award, empty: { name: "" } },
  { key: "publications", title: "Publications", noun: "publication", icon: BookOpen, empty: { title: "", authors: [] } },
] satisfies Array<{ key: SectionKey; title: string; noun: string; icon: typeof BookOpen; empty: Record<string, unknown> }>;

export function CareerReview({ form, onChange }: { form: OnboardingFormState; onChange: (patch: Partial<OnboardingFormState>) => void }) {
  const removal = useCareerRemoval(form, onChange);
  return <>{sections.map(({ key, title, noun, icon: Icon, empty }) => {
    const rows = form[key] as Array<Record<string, unknown>>;
    return <details key={key} className="focus-review-section" open={rows.length > 0}>
      <summary><Icon size={22} aria-hidden /><strong>{title}</strong><span>{rows.length} {rows.length === 1 ? noun : noun === "entry" ? "entries" : `${noun}s`}</span><ChevronDown size={19} aria-hidden /></summary>
      <div className="focus-review-records">
        {rows.map((row, index) => {
          const heading = String(row.title || row.name || row.school || `${noun} ${index + 1}`);
          const context = [row.company || row.organization || row.degree || row.issuer || row.publisher, row.location].filter(Boolean).join(" · ");
          const dates = [row.startDate || row.date || row.publicationDate, row.isCurrent ? "Present" : row.endDate].filter(Boolean).join(" – ");
          return <ReviewRecord key={index} heading={heading} context={context} dates={dates} row={row}
            form={form} onChange={onChange} section={key} index={index} noun={noun} onRemove={removal.remove} />;
        })}
        {!rows.length && <p className="text-sm text-foreground-secondary">No {title.toLowerCase()} added. Add only what applies to you.</p>}
        <button type="button" className="focus-add-record" onClick={() => onChange({ [key]: [...rows, { ...empty }] })}>Add {noun === "entry" ? "education" : noun}</button>
      </div>
    </details>;
  })}{removal.undo}</>;
}

function ReviewRecord({ heading, context, dates, row, form, onChange, section, index, noun, onRemove }: {
  heading: string; context: string; dates: string; row: Record<string, unknown>;
  form: OnboardingFormState; onChange: (patch: Partial<OnboardingFormState>) => void;
  section: SectionKey; index: number; noun: string; onRemove: (section: SectionKey, index: number) => void;
}) {
  const [editing, setEditing] = useState(!row.title && !row.name && !row.school);
  return <article className="focus-review-record">
    <div className="flex items-start justify-between gap-3">
      <div><strong>{heading}</strong>{context && <p>{context}</p>}{dates && <p>{dates}</p>}</div>
      <button type="button" className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-ring"
        aria-expanded={editing} aria-label={`${editing ? "Close editor for" : "Edit"} ${noun === "entry" ? "education" : noun} ${index + 1}`}
        onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit"}</button>
    </div>
    {editing ? <CareerSections form={form} onChange={onChange} sectionKeys={[section]} onlyIndex={index} framed={false} onRemove={onRemove} /> : <>
      {row.field ? <p>{String(row.field)}</p> : null}
      {row.description ? <p>{String(row.description)}</p> : null}
      {Array.isArray(row.bullets) && row.bullets.length > 0 && <ul>{row.bullets.slice(0, 2).map((bullet, n) => <li key={n}>{String(bullet)}</li>)}</ul>}
      {Array.isArray(row.bullets) && row.bullets.length > 2 && <p className="text-xs text-foreground-muted">{row.bullets.length - 2} more points · Edit to review all</p>}
    </>}
  </article>;
}
