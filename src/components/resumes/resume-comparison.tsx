"use client";

import { useEffect, useState } from "react";
import type { ResumeDocument } from "@/types/resume-document";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";

export function documentSections(document: ResumeDocument): Map<string, string> {
  const rows = new Map<string, string>([["Contact", Object.values(document.contact).filter(Boolean).join(" · ")]]);
  for (const section of document.sections) {
    const text = [section.content, ...(section.bullets ?? []), ...(section.entries ?? []).flatMap((entry) =>
      [entry.heading, entry.subheading, entry.location, entry.dates, ...entry.bullets],
    )].filter(Boolean).join("\n");
    rows.set(section.title, [rows.get(section.title), text].filter(Boolean).join("\n"));
  }
  return rows;
}

export function ResumeComparison({ workflowId, versionId, current, onClose }: {
  workflowId: string; versionId: string; current: ResumeDocument; onClose: () => void;
}) {
  const [previous, setPrevious] = useState<{ label: string; document: ResumeDocument }>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    setPrevious(undefined);
    setError(undefined);
    void fetch(`/api/v1/resumes/workflows/${encodeURIComponent(workflowId)}/versions/${encodeURIComponent(versionId)}`, { credentials: "include", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load this version");
        if (active) setPrevious(body);
      }).catch((failure) => { if (active) setError(controller.signal.aborted ? "Loading this version timed out." : failure.message); })
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [workflowId, versionId, attempt]);

  const before = previous ? documentSections(previous.document) : new Map<string, string>();
  const after = documentSections(current);
  const changed = [...new Set([...before.keys(), ...after.keys()])].filter((title) => before.get(title) !== after.get(title));
  return (
    <section aria-label="Resume version comparison" className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-semibold">{previous ? `${previous.label} compared with current` : "Compare versions"}</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>Close comparison</Button>
      </div>
      {error ? <ErrorState description={error} onRetry={() => setAttempt((value) => value + 1)} /> : !previous ? <p role="status">Loading version…</p> : (
        <>
          <p className="mb-3 text-sm text-foreground-secondary" role="status">{changed.length ? `${changed.length} section${changed.length === 1 ? "" : "s"} changed. Downloads use the current checked version.` : "These versions have the same resume content."}</p>
          {changed.map((title) => (
            <div key={title} className="mb-4">
              <h3 className="mb-2 text-sm font-semibold">{title}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-border p-3"><p className="mb-2 text-xs font-medium">{previous.label}</p><pre className="whitespace-pre-wrap break-words font-sans text-sm">{before.get(title) || "Not present"}</pre></div>
                <div className="rounded-lg border border-accent/30 bg-mint p-3"><p className="mb-2 text-xs font-medium">Current</p><pre className="whitespace-pre-wrap break-words font-sans text-sm">{after.get(title) || "Removed"}</pre></div>
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
