"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

type Question = { id: string; technology: string; reason: string };
type Answer = "yes_professional" | "yes_project" | "similar" | "no" | "not_sure";

type EvidenceDraft = {
  answer: Answer;
  employer: string;
  built: string;
  usage: string;
  outcome: string;
  duration: string;
  url: string;
};

const emptyEvidence = (): EvidenceDraft => ({
  answer: "not_sure",
  employer: "",
  built: "",
  usage: "",
  outcome: "",
  duration: "",
  url: "",
});

function evidenceSummary(value: EvidenceDraft): string {
  return [
    value.employer && `Where: ${value.employer}`,
    value.built && `Built: ${value.built}`,
    value.usage && `Used: ${value.usage}`,
    value.outcome && `Outcome: ${value.outcome}`,
    value.duration && `When: ${value.duration}`,
    value.url && `Link: ${value.url}`,
  ].filter(Boolean).join("\n");
}

export function TechConfirmCard({ workflowId, questions }: { workflowId: string; questions: Question[] }) {
  const [values, setValues] = useState<Record<string, EvidenceDraft>>({});
  const [saving, setSaving] = useState(false);
  const names = useMemo(() => questions.map((question) => question.technology).join(", "), [questions]);
  if (!questions.length) return null;

  async function save() {
    setSaving(true);
    try {
      const csrf = decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "");
      const response = await fetch(`/api/v1/resumes/workflows/${workflowId}/tech-answers`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          answers: Object.entries(values).map(([id, value]) => ({
            id,
            answer: value.answer,
            evidence: evidenceSummary(value) || undefined,
          })),
        }),
      });
      if (!response.ok) throw new Error("Could not save your answers");
      toast.success("Experience details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save your answers");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm relevant experience</CardTitle>
        <CardDescription>
          Our research indicates that this team may use {names}. Have you worked with any of these technologies? Optional — generation continues either way.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {questions.map((question) => {
          const value = values[question.id] ?? emptyEvidence();
          const needsEvidence = value.answer === "yes_professional" || value.answer === "yes_project";
          return (
            <div key={question.id} className="space-y-3 rounded-xl border border-border p-4">
              <div>
                <p className="font-medium">{question.technology}</p>
                <p className="text-sm text-foreground-secondary">{question.reason}</p>
              </div>
              <Label htmlFor={`answer-${question.id}`}>Your experience</Label>
              <select
                id={`answer-${question.id}`}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={value.answer}
                onChange={(event) => setValues({ ...values, [question.id]: { ...value, answer: event.target.value as Answer } })}
              >
                <option value="not_sure">Not sure</option>
                <option value="yes_professional">Yes — professionally</option>
                <option value="yes_project">Yes — in a project</option>
                <option value="similar">I used a similar technology</option>
                <option value="no">No</option>
              </select>
              {needsEvidence ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Employer, university, or project</Label>
                    <Input value={value.employer} onChange={(event) => setValues({ ...values, [question.id]: { ...value, employer: event.target.value } })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>What you built</Label>
                    <Textarea value={value.built} onChange={(event) => setValues({ ...values, [question.id]: { ...value, built: event.target.value } })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>How you used the technology</Label>
                    <Textarea value={value.usage} onChange={(event) => setValues({ ...values, [question.id]: { ...value, usage: event.target.value } })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Outcome or impact</Label>
                    <Input value={value.outcome} onChange={(event) => setValues({ ...values, [question.id]: { ...value, outcome: event.target.value } })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Approximate date or duration</Label>
                    <Input value={value.duration} onChange={(event) => setValues({ ...values, [question.id]: { ...value, duration: event.target.value } })} />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label>Optional URL or document link</Label>
                    <Input value={value.url} onChange={(event) => setValues({ ...values, [question.id]: { ...value, url: event.target.value } })} placeholder="https://…" />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
        <Button type="button" variant="secondary" onClick={save} disabled={saving || Object.keys(values).length === 0}>
          {saving ? "Saving…" : "Save confirmations"}
        </Button>
      </CardContent>
    </Card>
  );
}
