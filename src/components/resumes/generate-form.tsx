"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";

function csrfToken() {
  return decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.split("=")[1] ?? "");
}

export function GenerateForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ jobDescription: "", jobUrl: "", company: "", role: "", location: "" });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.jobDescription.trim() && !form.jobUrl.trim()) {
      toast.error("Paste a job description or enter a job URL");
      return;
    }
    setSubmitting(true);
    try {
      const storageKey = `resume-idempotency:${form.jobUrl || form.jobDescription.slice(0, 120)}`;
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const response = await fetch("/api/v1/resumes/generate", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken() },
        body: JSON.stringify({ ...form, idempotencyKey }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not start resume generation");
      sessionStorage.setItem(`resume-input:${body.workflowId}`, JSON.stringify(form));
      router.push(`/app/resumes/${body.workflowId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start resume generation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Create a tailored resume</CardTitle>
        <CardDescription>Share the role you want. We’ll research it and create an evidence-backed resume.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <Label htmlFor="job-description">Job description</Label>
            <Textarea id="job-description" className="min-h-56" value={form.jobDescription} onChange={(event) => setForm({ ...form, jobDescription: event.target.value })} placeholder="Paste the job description…" />
          </div>
          <div className="flex items-center gap-3 text-xs text-foreground-muted"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
          <div className="space-y-2">
            <Label htmlFor="job-url">Job URL</Label>
            <Input id="job-url" type="url" value={form.jobUrl} onChange={(event) => setForm({ ...form, jobUrl: event.target.value })} placeholder="https://company.com/jobs/role" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="company">Company (optional)</Label><Input id="company" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="role">Role (optional)</Label><Input id="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="location">Location (optional)</Label><Input id="location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div>
          </div>
          <Button type="submit" disabled={submitting}>{submitting ? "Starting…" : "Generate tailored resume"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
