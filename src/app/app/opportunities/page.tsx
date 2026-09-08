"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import {
  CANDIDATE_STATUS_OPTIONS,
  customerNextAction,
  defaultCandidateStatus,
  mapResumeProgress,
  type CandidateApplicationStatus,
} from "@/lib/application-presentation";
import { cn, formatRelative } from "@/lib/utils";
import { api } from "@/services/api";
import type { Application } from "@/types/domain";

type Row = Application & { candidateStatus: CandidateApplicationStatus };

export default function OpportunitiesPage() {
  const [apps, setApps] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CandidateApplicationStatus | "all">("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    void api.listApplications().then((items) => {
      setApps(
        items
          .filter((a) => !a.archived)
          .map((a) => ({
            ...a,
            candidateStatus: defaultCandidateStatus({
              ...a,
              candidateStatus: a.candidateStatus,
            }),
          })),
      );
      setLoaded(true);
    });
  }, []);

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      const q = query.trim().toLowerCase();
      if (q && !`${app.company} ${app.role}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && app.candidateStatus !== statusFilter) return false;
      return true;
    });
  }, [apps, query, statusFilter]);

  async function updateStatus(id: string, candidateStatus: CandidateApplicationStatus) {
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, candidateStatus } : a)));
    try {
      await api.updateApplication(id, { candidateStatus });
      toast.success("Status updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  }

  async function archiveId(id: string) {
    await api.archiveApplications([id]);
    setApps((prev) => prev.filter((a) => a.id !== id));
    setConfirmId(null);
    toast.success("Application archived");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Applications"
        description="Track resume readiness and where you are in each application."
        actions={
          <Link href="/app/radar" className={buttonVariants({ size: "sm" })}>
            Browse jobs
          </Link>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end" role="search" aria-label="Filter applications">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="apps-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
            <Input
              id="apps-search"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Company or role"
            />
          </div>
        </div>
        <div className="space-y-1.5 sm:w-52">
          <Label htmlFor="apps-status">Application status</Label>
          <select
            id="apps-status"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as CandidateApplicationStatus | "all")}
          >
            <option value="all">All</option>
            {CANDIDATE_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!loaded ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={apps.length === 0 ? "No applications yet" : "No applications match"}
          description={
            apps.length === 0
              ? "Open a job and tailor your resume — applications you start will show up here."
              : "Try another status or search term."
          }
          action={
            <Link href="/app/radar" className={buttonVariants()}>
              Go to Jobs
            </Link>
          }
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-md border border-border md:block" data-testid="applications-table">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Job</th>
                  <th className="px-3 py-2 font-medium">Resume</th>
                  <th className="px-3 py-2 font-medium">Added</th>
                  <th className="px-3 py-2 font-medium">Application status</th>
                  <th className="px-3 py-2 font-medium">Next action</th>
                  <th className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app) => {
                  const resume = mapResumeProgress(app);
                  const next = customerNextAction({ ...app, candidateStatus: app.candidateStatus });
                  return (
                    <tr key={app.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3">
                        <p className="font-medium text-foreground">{app.role}</p>
                        <p className="text-foreground-secondary">{app.company}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-md border border-border px-2 py-0.5 text-xs">{resume}</span>
                      </td>
                      <td className="px-3 py-3 text-foreground-secondary">{formatRelative(app.createdAt)}</td>
                      <td className="px-3 py-3">
                        <select
                          aria-label={`Status for ${app.role}`}
                          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          value={app.candidateStatus}
                          onChange={(e) => void updateStatus(app.id, e.target.value as CandidateApplicationStatus)}
                        >
                          {CANDIDATE_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="text-foreground-secondary">{next}</span>
                          {app.resumeId ? (
                            <Link href={`/app/resumes/${app.id}`} className="text-accent hover:underline">
                              View resume
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className="relative px-3 py-3">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label="More actions"
                          onClick={() => setMenuOpen(menuOpen === app.id ? null : app.id)}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                        {menuOpen === app.id ? (
                          <div className="absolute right-3 z-10 mt-1 w-40 rounded-md border border-border bg-background p-1 shadow-sm">
                            <button
                              type="button"
                              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                              onClick={() => {
                                setMenuOpen(null);
                                setConfirmId(app.id);
                              }}
                            >
                              Archive
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border rounded-md border border-border md:hidden" data-testid="applications-mobile">
            {filtered.map((app) => {
              const resume = mapResumeProgress(app);
              const next = customerNextAction({ ...app, candidateStatus: app.candidateStatus });
              return (
                <li key={app.id} className="space-y-2 p-3">
                  <div>
                    <p className="font-medium">{app.role}</p>
                    <p className="text-sm text-foreground-secondary">{app.company}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md border border-border px-2 py-0.5">Resume: {resume}</span>
                    <span className="rounded-md border border-border px-2 py-0.5">Added {formatRelative(app.createdAt)}</span>
                  </div>
                  <Label className="sr-only" htmlFor={`m-status-${app.id}`}>
                    Application status
                  </Label>
                  <select
                    id={`m-status-${app.id}`}
                    className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
                    value={app.candidateStatus}
                    onChange={(e) => void updateStatus(app.id, e.target.value as CandidateApplicationStatus)}
                  >
                    {CANDIDATE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <div className={cn("flex flex-wrap gap-3 text-sm")}>
                    <span className="text-foreground-secondary">{next}</span>
                    {app.resumeId ? (
                      <Link href={`/app/resumes/${app.id}`} className="text-accent">
                        View resume
                      </Link>
                    ) : null}
                    <button type="button" className="text-foreground-muted" onClick={() => setConfirmId(app.id)}>
                      Archive
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Dialog open={Boolean(confirmId)} onOpenChange={(open) => !open && setConfirmId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive application?</DialogTitle>
            <DialogDescription>You can hide it from the tracker. Workflow history is kept.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => confirmId && void archiveId(confirmId)}>
              Archive
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
