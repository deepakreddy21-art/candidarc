"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label, Textarea } from "@/components/ui/input";

const quickActions = [
  "Make it more technical",
  "Strengthen impact",
  "Improve role alignment",
  "Reduce repetition",
  "Make it more concise",
  "Emphasize leadership",
  "Fit to one page",
  "Change template",
];

export function RefinePanel({ workflowId }: { workflowId: string }) {
  const router = useRouter();
  const [instruction, setInstruction] = useState("");
  const [quickAction, setQuickAction] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!instruction.trim()) return toast.error("Describe what you would like to improve");
    setSubmitting(true);
    try {
      const csrf = decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "");
      const response = await fetch(`/api/v1/resumes/workflows/${workflowId}/refine`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ instruction, quickAction }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not create a new version");
      router.push(`/app/resumes/${body.workflowId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create a new version");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Refine this resume</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant={quickAction === action ? "default" : "secondary"}
              onClick={() => {
                setQuickAction(action);
                setInstruction(action);
              }}
            >
              {action}
            </Button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="refinement">What would you like to improve?</Label>
          <Textarea id="refinement" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
        </div>
        <Button type="button" onClick={submit} disabled={submitting}>
          {submitting ? "Creating…" : "Create new version"}
        </Button>
      </CardContent>
    </Card>
  );
}
