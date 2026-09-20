"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ResumeDocument } from "@/types/resume-document";
import { CANDIDARC_CLASSIC_V1_TEMPLATE } from "@/types/resume-document";
import { renderResumeDocumentHtml } from "@/lib/resume-html";
import { cn } from "@/lib/utils";

type Props = {
  document: ResumeDocument;
  className?: string;
  zoom?: number;
  onSelectionChange?: (text: string) => void;
};

/** Renders the canonical ResumeDocument via shared HTML — no separate content reconstruction. */
export function ResumePreview({ document, className, zoom = 1, onSelectionChange }: Props) {
  const [scale, setScale] = useState(zoom);
  const [pageHeight, setPageHeight] = useState(1056);
  const html = useMemo(() => renderResumeDocumentHtml(document, { preview: true }), [document]);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);
  const selectionCallback = useRef(onSelectionChange);
  selectionCallback.current = onSelectionChange;
  useEffect(() => () => cleanupRef.current?.(), []);
  function connectSelection() {
    cleanupRef.current?.();
    const frameDocument = frameRef.current?.contentDocument;
    if (!frameDocument) return;
    selectionCallback.current?.("");
    const updateSelection = () => selectionCallback.current?.(frameDocument.getSelection()?.toString().trim() ?? "");
    frameDocument.addEventListener("mouseup", updateSelection);
    frameDocument.addEventListener("keyup", updateSelection);
    frameDocument.addEventListener("touchend", updateSelection);
    const measure = () => setPageHeight(Math.max(1056, Math.ceil(frameDocument.querySelector("main")?.getBoundingClientRect().height ?? 1056)));
    const observer = new ResizeObserver(measure);
    observer.observe(frameDocument.body);
    measure();
    cleanupRef.current = () => {
      observer.disconnect();
      frameDocument.removeEventListener("mouseup", updateSelection);
      frameDocument.removeEventListener("keyup", updateSelection);
      frameDocument.removeEventListener("touchend", updateSelection);
    };
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-2 text-xs text-foreground-muted">
        <span className="truncate">{document.metadata.template ?? CANDIDARC_CLASSIC_V1_TEMPLATE}</span>
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
        <div className="relative mx-auto" style={{ width: 816 * scale, height: pageHeight * scale }}>
        <iframe
          ref={frameRef}
          onLoad={connectSelection}
          sandbox="allow-same-origin"
          title="Resume preview"
          className="absolute left-0 top-0 block border-0 bg-white shadow-md"
          style={{ width: 816, height: pageHeight, transform: `scale(${scale})`, transformOrigin: "top left" }}
          srcDoc={html}
        />
        </div>
      </div>
    </div>
  );
}
