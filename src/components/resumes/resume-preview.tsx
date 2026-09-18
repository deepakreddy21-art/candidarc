"use client";

import { useMemo, useState } from "react";
import type { ResumeDocument } from "@/types/resume-document";
import { CANDIDARC_ATS_V1_TEMPLATE } from "@/types/resume-document";
import { renderResumeDocumentHtml } from "@/lib/resume-html";
import { cn } from "@/lib/utils";

type Props = {
  document: ResumeDocument;
  className?: string;
  zoom?: number;
};

/** Renders the canonical ResumeDocument via shared HTML — no separate content reconstruction. */
export function ResumePreview({ document, className, zoom = 1 }: Props) {
  const [scale, setScale] = useState(zoom);
  const html = useMemo(() => renderResumeDocumentHtml(document, { preview: true }), [document]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-foreground-muted">
        <span className="truncate">{document.metadata.template ?? CANDIDARC_ATS_V1_TEMPLATE}</span>
        <div className="flex items-center gap-2">
          <span>Zoom</span>
          <button
            type="button"
            className="rounded border border-border px-2 py-1"
            onClick={() => setScale((s) => Math.max(0.7, s - 0.1))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span className="w-10 text-center">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            className="rounded border border-border px-2 py-1"
            onClick={() => setScale((s) => Math.min(1.3, s + 0.1))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>
      <div className="overflow-auto rounded-xl border border-border bg-[#eef1f4] p-4">
        <iframe
          title="Resume preview"
          className="mx-auto block w-full max-w-[8.5in] min-h-[700px] origin-top border-0 bg-transparent shadow-md"
          style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}
          srcDoc={html}
        />
      </div>
    </div>
  );
}
