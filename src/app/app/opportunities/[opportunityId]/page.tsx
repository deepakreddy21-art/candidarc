"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import {
  customerNextAction,
  customerResumePath,
  defaultCandidateStatus,
  mapResumeProgress,
} from "@/lib/application-presentation";
import { formatRelative } from "@/lib/utils";
import { api, ApiError } from "@/services/api";
import { ApplicationCopilot } from "@/components/copilot/application-copilot";
import { AskPanel } from "@/components/assistant/ask-panel";
import type { Application } from "@/types/domain";

export default function OpportunityOverviewPage() {
  const params = useParams<{ opportunityId: string }>();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [contactName, setContactName] = useState("");
  const [outreachDraft, setOutreachDraft] = useState("");
  const [connectionBasis, setConnectionBasis] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    void api.getApplication(params.opportunityId).then((found) => {
      setApp(found ?? null);
      if (found) {
        setNotes(found.notes ?? "");
        setFollowUpAt(found.followUpAt ?? "");
        setInterviewAt(found.interviewAt ?? "");
        setCoverLetter(found.coverLetter ?? "");
        setContactName(found.contacts?.[0]?.name ?? "");
        setOutreachDraft(found.outreachDraft ?? "");
      }
    });
  }, [params.opportunityId]);

  if (app === undefined) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!app) {
    return (
      <EmptyState
        title="Application not found"
        description="It may have been archived or you may not have access."
        action={
          <Link href="/app/opportunities" className={buttonVariants()}>
            Back to Applications
          </Link>
        }
      />
    );
  }

  const resume = mapResumeProgress(app);
  const status = defaultCandidateStatus(app);
  const next = customerNextAction({ ...app, candidateStatus: status });
  const resumeHref = customerResumePath(app);

  async function saveTracker() {
    if (!app) return;
    setSaving(true);
    try {
      const saved = await api.updateApplication(app.id, {
        notes,
        followUpAt,
        interviewAt,
        coverLetter,
        outreachDraft,
        contacts: contactName.trim() ? [{ name: contactName.trim() }] : [],
      });
      setApp(saved);
      toast.success("Application workspace saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function csrfHeaders() {
    const csrf = decodeURIComponent(
      document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "",
    );
    return { "content-type": "application/json", "x-csrf-token": csrf };
  }

  async function generateCoverLetter() {
    if (!app) return;
    const application = app;
    setGenerating(true);
    try {
      const response = await fetch(`/api/v1/applications/${application.id}/cover-letter`, {
        method: "POST",
        credentials: "include",
        headers: await csrfHeaders(),
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not draft cover letter");
      setCoverLetter(body.letter);
      setApp(body.application);
      toast.success("Cover letter drafted from your evidence only");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft cover letter");
    } finally {
      setGenerating(false);
    }
  }

  async function generateOutreach() {
    if (!app) return;
    if (!contactName.trim()) {
      toast.error("Add a contact you manage first");
      return;
    }
    const application = app;
    setGenerating(true);
    try {
      const response = await fetch(`/api/v1/applications/${application.id}/outreach-draft`, {
        method: "POST",
        credentials: "include",
        headers: await csrfHeaders(),
        body: JSON.stringify({
          contactName: contactName.trim(),
          connectionBasis: connectionBasis.trim() || undefined,
          notes,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not draft outreach");
      setOutreachDraft(body.draft);
      setApp(body.application);
      toast.success("Outreach draft ready — nothing was sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not draft outreach");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={app.role}
        description={`${app.company}${app.location ? ` · ${app.location}` : ""}`}
        actions={
          <Link href="/app/opportunities" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            All applications
          </Link>
        }
      />

      <dl className="grid gap-3 border border-border p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Resume</dt>
          <dd className="mt-1 font-medium">{resume}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Application status</dt>
          <dd className="mt-1 font-medium">{status}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Added</dt>
          <dd className="mt-1">{formatRelative(app.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-foreground-muted">Next action</dt>
          <dd className="mt-1">{next}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {resumeHref ? (
          <Link href={resumeHref} className={buttonVariants()}>
            Review / download resume
          </Link>
        ) : (
          <Link href="/app/resumes/new" className={buttonVariants()}>
            Tailor a resume
          </Link>
        )}
        <Link href="/app/radar" className={buttonVariants({ variant: "secondary" })}>
          Browse jobs
        </Link>
        <Link
          href={`/app/opportunities/${app.id}/prepare`}
          className={buttonVariants({ variant: "secondary" })}
        >
          Prepare for interview
        </Link>
      </div>

      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">Workspace</h2>
        <p className="text-xs text-foreground-muted">
          Opening an employer site is not proof you applied. Confirm status after you submit.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="follow-up">Follow-up date</Label>
            <Input id="follow-up" type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="interview-at">Interview date</Label>
            <Input id="interview-at" type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="contact-name">Contact / referral</Label>
          <Input
            id="contact-name"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Name you manage — no invented alumni matches"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cover-letter">Cover letter draft</Label>
          <Textarea
            id="cover-letter"
            value={coverLetter}
            onChange={(e) => setCoverLetter(e.target.value)}
            rows={8}
            placeholder="Write from your evidence only. Do not invent connections or credentials."
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void generateCoverLetter()} disabled={generating}>
            {generating ? "Drafting…" : "Draft from career evidence"}
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="connection-basis">Connection basis (optional)</Label>
          <Input
            id="connection-basis"
            value={connectionBasis}
            onChange={(e) => setConnectionBasis(e.target.value)}
            placeholder="Only facts you know, e.g. same university"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="outreach-draft">Outreach draft</Label>
          <Textarea
            id="outreach-draft"
            value={outreachDraft}
            onChange={(e) => setOutreachDraft(e.target.value)}
            rows={6}
            placeholder="Editable draft only. CandidArc does not send this."
          />
          <Button type="button" variant="secondary" size="sm" onClick={() => void generateOutreach()} disabled={generating}>
            Draft outreach
          </Button>
        </div>
        <Button type="button" onClick={() => void saveTracker()} disabled={saving}>
          {saving ? "Saving…" : "Save workspace"}
        </Button>
      </section>
      <AskPanel contextType="application" contextId={app.id} company={app.company} role={app.role} />
      <ApplicationCopilot opportunityId={app.id} company={app.company} role={app.role} />
    </div>
  );
}
