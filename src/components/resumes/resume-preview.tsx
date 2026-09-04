"use client";

import { useMemo, useState } from "react";
import type { ResumeDocument } from "@/types/resume-document";
import { cn } from "@/lib/utils";

type Props = {
  document: ResumeDocument;
  className?: string;
  zoom?: number;
};

export function ResumePreview({ document, className, zoom = 1 }: Props) {
  const [scale, setScale] = useState(zoom);
  const html = useMemo(() => {
    const escape = (value: string) =>
      value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const contact = [document.contact.email, document.contact.phone, document.contact.location]
      .filter(Boolean)
      .map((value) => escape(String(value)))
      .join(" · ");

    const sections = document.sections
      .map((section) => {
        const bullets = section.bullets?.length
          ? `<ul class="list-disc pl-5">${section.bullets.map((b) => `<li>${escape(b)}</li>`).join("")}</ul>`
          : "";
        const entries = (section.entries ?? [])
          .map((entry) => {
            const meta = [entry.location, entry.dates].filter(Boolean).join(" · ");
            return `<article class="mt-2">
              <div class="flex justify-between gap-3 text-[11px] font-semibold">
                <span>${escape(entry.heading)}</span>
                ${entry.subheading ? `<span class="font-medium text-neutral-600">${escape(entry.subheading)}</span>` : ""}
              </div>
              ${meta ? `<p class="text-[10px] text-neutral-600">${escape(meta)}</p>` : ""}
              ${entry.bullets.length ? `<ul class="mt-1 list-disc pl-5">${entry.bullets.map((b) => `<li>${escape(b)}</li>`).join("")}</ul>` : ""}
            </article>`;
          })
          .join("");
        return `<section class="mt-4 break-inside-avoid">
          <h2 class="border-b border-neutral-300 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">${escape(section.title)}</h2>
          ${section.content ? `<p class="mt-2 text-[11px] leading-relaxed">${escape(section.content)}</p>` : ""}
          ${bullets}
          ${entries}
        </section>`;
      })
      .join("");

    return `<div class="resume-doc text-neutral-900">
      <header class="border-b border-neutral-300 pb-3">
        <h1 class="text-[22px] font-semibold leading-tight">${escape(document.contact.name)}</h1>
        ${document.contact.headline ? `<p class="mt-1 text-[12px] text-neutral-700">${escape(document.contact.headline)}</p>` : ""}
        ${contact ? `<p class="mt-1 text-[10px] text-neutral-600">${contact}</p>` : ""}
        <p class="mt-2 text-[10px] text-neutral-500">${escape(document.metadata.role)} · ${escape(document.metadata.company)}</p>
      </header>
      ${sections}
    </div>`;
  }, [document]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-end gap-2 text-xs text-foreground-muted">
        <span>Zoom</span>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setScale((s) => Math.max(0.7, s - 0.1))} aria-label="Zoom out">
          −
        </button>
        <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
        <button type="button" className="rounded border border-border px-2 py-1" onClick={() => setScale((s) => Math.min(1.3, s + 0.1))} aria-label="Zoom in">
          +
        </button>
      </div>
      <div className="overflow-auto rounded-xl border border-border bg-[#eef1f4] p-4">
        <div
          className="mx-auto w-[8.5in] min-h-[11in] origin-top bg-white p-[0.55in] shadow-md"
          style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
        >
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
