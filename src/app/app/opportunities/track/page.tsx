"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/services/api";

export default function TrackApplicationPage() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"Saved" | "Applied">("Applied");
  return <div className="mx-auto max-w-xl space-y-6">
    <PageHeader title="Add application" description="Keep track of a job you found or applied for elsewhere." />
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      if (inFlight.current) return;
      const data = new FormData(event.currentTarget);
      inFlight.current = true;
      setSaving(true);
      setError("");
      try {
        const app = await api.createApplication({
          trackingOnly: true,
          company: String(data.get("company")).trim(),
          role: String(data.get("role")).trim(),
          location: String(data.get("location") ?? "").trim(),
          jobUrl: String(data.get("jobUrl") ?? "").trim() || undefined,
          candidateStatus: status,
          appliedAt: status === "Applied" ? String(data.get("appliedAt") ?? "") || undefined : undefined,
        });
        router.push(`/app/opportunities/${app.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save. Your details are still here; try again.");
      } finally {
        inFlight.current = false;
        setSaving(false);
      }
    }}>
      <fieldset disabled={saving} className="space-y-4">
        <div className="space-y-1"><Label htmlFor="track-company">Company</Label><Input id="track-company" name="company" required maxLength={120} /></div>
        <div className="space-y-1"><Label htmlFor="track-role">Job title</Label><Input id="track-role" name="role" required maxLength={160} /></div>
        <div className="space-y-1"><Label htmlFor="track-location">Location (optional)</Label><Input id="track-location" name="location" maxLength={160} /></div>
        <div className="space-y-1"><Label htmlFor="track-url">Job link (optional)</Label><Input id="track-url" name="jobUrl" type="url" autoCapitalize="none" placeholder="https://" /></div>
        <div className="space-y-1"><Label htmlFor="track-status">Application status</Label><select id="track-status" className="h-11 w-full rounded-md border border-border bg-background px-3" value={status} onChange={(e) => setStatus(e.target.value as "Saved" | "Applied")}><option>Applied</option><option>Saved</option></select></div>
        {status === "Applied" && <div className="space-y-1"><Label htmlFor="track-date">Date applied (optional)</Label><Input id="track-date" name="appliedAt" type="date" /></div>}
        <p className="text-sm text-foreground-secondary">This saves a tracking entry. You can tailor a resume separately whenever you need one.</p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-3"><Button type="submit">{saving ? "Saving…" : "Save application"}</Button><Link href="/app/opportunities" className={buttonVariants({ variant: "secondary" })}>Cancel</Link></div>
      </fieldset>
    </form>
  </div>;
}
