"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/feedback";
import type { MatchBreakdown } from "@/types/radar";

const CATEGORIES: Array<{ key: keyof Omit<MatchBreakdown, "overall" | "notes">; label: string }> = [
  { key: "skills", label: "Skills" },
  { key: "evidence", label: "Evidence" },
  { key: "experience", label: "Experience" },
  { key: "seniority", label: "Seniority" },
  { key: "location", label: "Location" },
  { key: "compensation", label: "Compensation" },
  { key: "eligibility", label: "Eligibility" },
  { key: "careerDirection", label: "Career direction" },
];

export function MatchBreakdownPanel({
  breakdown,
  evidenceCoverage,
}: {
  breakdown: MatchBreakdown;
  evidenceCoverage?: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Match breakdown</CardTitle>
        <CardDescription>
          Explainable fit across profile, Evidence Vault, and preferences — not a single opaque score.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-foreground-muted">Overall</p>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">{breakdown.overall}%</p>
          </div>
          {typeof evidenceCoverage === "number" ? (
            <div className="text-right">
              <p className="text-[11px] text-foreground-muted">Evidence coverage</p>
              <p className="text-lg font-semibold tabular-nums">{evidenceCoverage}%</p>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          {CATEGORIES.map((cat) => (
            <div key={cat.key}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span>{cat.label}</span>
                <span className="tabular-nums text-foreground-muted">{breakdown[cat.key]}%</span>
              </div>
              <ProgressBar
                value={breakdown[cat.key]}
                tone={cat.key === "evidence" || cat.key === "careerDirection" ? "cyan" : "accent"}
              />
            </div>
          ))}
        </div>

        {breakdown.notes?.length ? (
          <ul className="space-y-1.5 rounded-xl border border-border bg-canvas p-3 text-sm text-foreground-secondary">
            {breakdown.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
