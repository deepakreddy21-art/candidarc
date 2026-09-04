"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allowDemoFallback } from "@/lib/app-mode";
import type {
  ApplicationMode,
  FieldConfidence,
  ReusableAnswer,
} from "@server/copilot/types";

const demoAnswers: ReusableAnswer[] = allowDemoFallback()
  ? [
      {
        id: "answer_full_name",
        tenantId: "demo",
        userId: "demo",
        intent: "full_name",
        label: "Full name",
        answer: "Demo Candidate",
        confidence: "VERIFIED",
        source: "profile",
        sensitive: false,
        requiresApproval: false,
        approvedForOpportunityIds: [],
        updatedAt: "2026-09-04T12:00:00Z",
      },
      {
        id: "answer_email",
        tenantId: "demo",
        userId: "demo",
        intent: "email",
        label: "Email",
        answer: "candidate@example.com",
        confidence: "HIGH_CONFIDENCE",
        source: "profile",
        sensitive: false,
        requiresApproval: false,
        approvedForOpportunityIds: [],
        updatedAt: "2026-09-04T12:00:00Z",
      },
      {
        id: "answer_work_authorization",
        tenantId: "demo",
        userId: "demo",
        intent: "work_authorization",
        label: "US work authorization",
        answer: true,
        confidence: "SENSITIVE",
        source: "user",
        sensitive: true,
        requiresApproval: true,
        approvedForOpportunityIds: [],
        updatedAt: "2026-09-04T12:00:00Z",
      },
    ]
  : [];

export function ApplicationCopilot({
  opportunityId,
  company = "Target company",
  role = "Target role",
  duplicateWarning,
  answers = demoAnswers,
}: {
  opportunityId: string;
  company?: string;
  role?: string;
  duplicateWarning?: string;
  answers?: ReusableAnswer[];
}) {
  const [mode, setMode] = useState<ApplicationMode>("prepare_only");
  const [approved, setApproved] = useState<string[]>([]);
  const unresolved = useMemo(
    () => answers.filter((answer) => answer.confidence === "UNSUPPORTED"),
    [answers],
  );

  return (
    <div className="space-y-5">
      {duplicateWarning ? (
        <div className="flex gap-3 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div><strong>Possible duplicate</strong><p>{duplicateWarning}</p></div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Application review</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Summary label="Company" value={company} />
          <Summary label="Role" value={role} />
          <Summary label="Resume" value="Tailored resume package" icon={<FileText />} />
          <Summary label="Job status" value="Verified open" icon={<CheckCircle2 />} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mode</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {(["prepare_only", "autofill_review"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded-xl border p-4 text-left ${mode === value ? "border-accent bg-accent/5" : "border-border"}`}
            >
              <span className="font-medium">
                {value === "prepare_only" ? "Prepare Only" : "Autofill and Review"}
              </span>
              <p className="mt-1 text-xs text-foreground-muted">
                {value === "prepare_only"
                  ? "Build a package without writing to the employer form."
                  : "Fill approved fields, then stop for your review."}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Answers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {answers.map((answer) => {
            const isApproved = approved.includes(answer.id);
            return (
              <div key={answer.id} className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{answer.label}</p>
                    <ConfidenceBadge value={answer.confidence} />
                  </div>
                  <p className="mt-1 text-sm text-foreground-secondary">
                    {String(answer.answer)}
                  </p>
                  {answer.sensitive ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-foreground-muted">
                      <LockKeyhole className="h-3 w-3" /> Approval applies only to this opportunity.
                    </p>
                  ) : null}
                </div>
                {answer.requiresApproval ? (
                  <Button
                    size="sm"
                    variant={isApproved ? "secondary" : "default"}
                    onClick={() => setApproved((items) => [...new Set([...items, answer.id])])}
                  >
                    {isApproved ? "Approved" : "Approve autofill"}
                  </Button>
                ) : null}
              </div>
            );
          })}
          <div className="rounded-xl bg-canvas p-4 text-sm">
            <p className="font-medium">Custom and unresolved questions</p>
            <p className="mt-1 text-foreground-muted">
              {unresolved.length ? `${unresolved.length} answers need review.` : "No unresolved required fields detected."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={mode === "autofill_review" && answers.some((a) => a.requiresApproval && !approved.includes(a.id))}>
          {mode === "prepare_only" ? "Download application package" : "Continue to employer form"}
        </Button>
      </div>
      <p className="sr-only">Opportunity {opportunityId}</p>
    </div>
  );
}

function Summary({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return <div className="rounded-xl bg-canvas p-4"><p className="text-xs text-foreground-muted">{label}</p><div className="mt-1 flex items-center gap-2 text-sm font-medium">{icon}{value}</div></div>;
}

export function ConfidenceBadge({ value }: { value: FieldConfidence }) {
  const tone = value === "VERIFIED" ? "bg-emerald-500/10 text-emerald-700" : value === "SENSITIVE" || value === "NEEDS_REVIEW" ? "bg-amber-500/10 text-amber-700" : value === "BLOCKED" || value === "UNSUPPORTED" ? "bg-red-500/10 text-red-700" : "bg-blue-500/10 text-blue-700";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{value.replaceAll("_", " ")}</span>;
}
