"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { Input, Label } from "@/components/ui/input";
import {
  CANDIDATE_STATUS_OPTIONS,
  customerNextAction,
  customerResumePath,
  defaultCandidateStatus,
  mapResumeProgress,
  type CandidateApplicationStatus,
} from "@/lib/application-presentation";
import { cn, formatRelative } from "@/lib/utils";
import { api, ApiError, isCancelledError } from "@/services/api";
import type { Application } from "@/types/domain";

type Row = Application & { candidateStatus: CandidateApplicationStatus };

export default function OpportunitiesPage() {
  const [apps, setApps] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CandidateApplicationStatus | "all">("all");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const pendingIds = useRef(new Set<string>());
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [statusErrors, setStatusErrors] = useState<Record<string, string | undefined>>({});

  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoadError(null);
    try {
      const items = await api.listApplications(true);
      if (id !== requestId.current) return;
      setApps(
        items.map((a) => ({
          ...a,
          candidateStatus: defaultCandidateStatus({
            ...a,
            candidateStatus: a.candidateStatus,
          }),
        })),
      );
      setLoaded(true);
    } catch (err) {
      if (isCancelledError(err) || id !== requestId.current) return;
      setLoadError(err instanceof Error ? err.message : "Could not load applications");
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => apps.filter((app) => (showArchived ? app.archived : !app.archived)),
    [apps, showArchived],
  );

  const counts = useMemo(() => {
    const active = apps.filter((a) => !a.archived);
    const followUpsDue = active.filter((a) => a.followUpAt && new Date(a.followUpAt).getTime() <= Date.now()).length;
    return {
      saved: active.filter((a) => a.candidateStatus === "Saved").length,
      applied: active.filter((a) => a.candidateStatus === "Applied").length,
      interviewing: active.filter((a) => a.candidateStatus === "Interviewing").length,
      offers: active.filter((a) => a.candidateStatus === "Offer").length,
      followUpsDue,
    };
  }, [apps]);

  const filtered = useMemo(() => {
    return visible.filter((app) => {
      const q = query.trim().toLowerCase();
      if (q && !`${app.company} ${app.role}`.toLowerCase().includes(q)) return false;
      if (statusFilter !== "all" && app.candidateStatus !== statusFilter && !pending[app.id] && !statusErrors[app.id]) return false;
      if (dueOnly && (!app.followUpAt || new Date(app.followUpAt).getTime() > Date.now())) return false;
      return true;
    });
  }, [visible, query, statusFilter, dueOnly, pending, statusErrors]);

  async function updateStatus(id: string, candidateStatus: CandidateApplicationStatus) {
    if (pendingIds.current.has(id) || statusErrors[id]) return;
    pendingIds.current.add(id);
    setPending((prev) => ({ ...prev, [id]: true }));
    const current = apps.find((a) => a.id === id);
    const previousStatus = current?.candidateStatus;
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, candidateStatus } : a)));
    try {
      const updated = await api.updateApplication(id, {
        candidateStatus,
        expectedVersion: current?.version,
      });
      setApps((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                ...updated,
                candidateStatus: defaultCandidateStatus({
                  ...updated,
                  candidateStatus: updated.candidateStatus ?? candidateStatus,
                }),
              }
            : a,
        ),
      );
      toast.success("Status updated");
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409;
      if (!conflict) setApps((prev) => prev.map((a) => a.id === id ? { ...a, candidateStatus: previousStatus ?? a.candidateStatus } : a));
      setStatusErrors((prev) => ({ ...prev, [id]: conflict
        ? "Not saved. Status changed in another tab. Your selection is shown below."
        : "Status was not saved. Load the saved status and try again." }));
    } finally {
      pendingIds.current.delete(id);
      setPending((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function reloadStatus(id: string) {
    if (pendingIds.current.has(id)) return;
    pendingIds.current.add(id);
    setPending((prev) => ({ ...prev, [id]: true }));
    try {
      const saved = await api.getApplication(id);
      if (!saved) throw new Error("Application no longer available");
      setApps((prev) => prev.map((a) => a.id === id ? { ...saved, candidateStatus: defaultCandidateStatus(saved) } : a));
      setStatusErrors((prev) => ({ ...prev, [id]: undefined }));
    } catch {
      setStatusErrors((prev) => ({ ...prev, [id]: "Could not load saved status. Your selection is still here; try again." }));
    } finally {
      pendingIds.current.delete(id);
      setPending((prev) => ({ ...prev, [id]: false }));
    }
  }

  function statusFeedback(id: string) {
    return <div aria-live="polite" className="mt-1 max-w-xs text-xs">
      {pending[id] && <p>Saving…</p>}
      {statusErrors[id] && <><p role="alert" className="text-destructive">{statusErrors[id]}</p><button type="button" disabled={pending[id]} className="mt-1 min-h-9 text-accent underline" onClick={() => void reloadStatus(id)}>Load saved status</button></>}
    </div>;
  }

  async function archiveId(id: string) {
    try {
      await api.archiveApplications([id]);
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, archived: true } : a)));
      setConfirmId(null);
      toast.success("Application archived");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not archive application"); }
  }

  async function restoreId(id: string) {
    try {
      await api.restoreApplication(id);
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, archived: false } : a)));
      toast.success("Application restored");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Could not restore application"); }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Applications"
        description="Track resume readiness and where you are in each application."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={showArchived ? "default" : "secondary"}
              aria-pressed={showArchived}
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? "Show active" : "Show archived"}
            </Button>
            <Link href="/app/opportunities/track" className={buttonVariants({ size: "sm", variant: "secondary" })}>Add application</Link>
            <Link href="/app/radar" className={buttonVariants({ size: "sm" })}>
              Browse jobs
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2" aria-label="Application shortcuts">
        {([["Saved", counts.saved], ["Applied", counts.applied], ["Interviewing", counts.interviewing], ["Offer", counts.offers]] as const).map(([status, count]) => (
          <Button key={status} type="button" size="sm" variant="secondary" aria-pressed={statusFilter === status && !dueOnly} onClick={() => { setShowArchived(false); setDueOnly(false); setStatusFilter(statusFilter === status ? "all" : status); }}>{status === "Offer" ? "Offers" : status} <span className="ml-2 tabular-nums">{count}</span></Button>
        ))}
        <Button type="button" size="sm" variant="secondary" aria-pressed={dueOnly} onClick={() => { setShowArchived(false); setStatusFilter("all"); setDueOnly((value) => !value); }}>Follow-ups due <span className="ml-2 tabular-nums">{counts.followUpsDue}</span></Button>
      </div>

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
        <div role="status" aria-live="polite" className="space-y-2">
          <span className="sr-only">Loading applications</span>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : loadError ? (
        <ErrorState description={loadError} onRetry={() => { setLoaded(false); void load(); }} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={visible.length === 0 ? (showArchived ? "No archived applications" : "No applications yet") : "No applications match"}
          description={
            visible.length === 0
              ? showArchived
                ? "Archived applications will appear here."
                : "Add an application you already started, or find a job to apply for."
              : "Try another status or search term."
          }
          action={
            visible.length > 0 ? <Button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); setDueOnly(false); }}>Clear filters</Button> : <Link href={showArchived ? "/app/radar" : "/app/opportunities/track"} className={buttonVariants()}>{showArchived ? "Go to Jobs" : "Add application"}</Link>
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
                  const resumeHref = customerResumePath(app);
                  return (
                    <tr key={app.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-3">
                        <Link href={`/app/opportunities/${app.id}`} className="font-medium text-foreground hover:underline">
                          {app.role}
                        </Link>
                        <p className="text-foreground-secondary">{app.company}</p>
                        {app.followUpAt && <p className="mt-1 text-xs text-foreground-muted">Follow up: {app.followUpAt}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-md border border-border px-2 py-0.5 text-xs">{resume}</span>
                      </td>
                      <td className="px-3 py-3 text-foreground-secondary">{formatRelative(app.createdAt)}</td>
                      <td className="px-3 py-3">
                        <select
                          aria-label={`Status for ${app.role}`}
                          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                          disabled={pending[app.id] || Boolean(statusErrors[app.id])}
                          value={app.candidateStatus}
                          onChange={(e) => void updateStatus(app.id, e.target.value as CandidateApplicationStatus)}
                        >
                          {CANDIDATE_STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                        {statusFeedback(app.id)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <span className="text-foreground-secondary">{next}</span>
                          {resumeHref ? (
                            <Link href={resumeHref} className="text-accent hover:underline">
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
                                if (app.archived) void restoreId(app.id);
                                else setConfirmId(app.id);
                              }}
                            >
                              {app.archived ? "Restore" : "Archive"}
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
              const resumeHref = customerResumePath(app);
              return (
                <li key={app.id} className="space-y-2 p-3">
                  <div>
                    <Link href={`/app/opportunities/${app.id}`} className="font-medium hover:underline">
                      {app.role}
                    </Link>
                    <p className="text-sm text-foreground-secondary">{app.company}</p>
                    {app.followUpAt && <p className="text-xs text-foreground-muted">Follow up: {app.followUpAt}</p>}
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
                    disabled={pending[app.id] || Boolean(statusErrors[app.id])}
                    value={app.candidateStatus}
                    onChange={(e) => void updateStatus(app.id, e.target.value as CandidateApplicationStatus)}
                  >
                    {CANDIDATE_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  {statusFeedback(app.id)}
                  <div className={cn("flex flex-wrap gap-3 text-sm")}>
                    <span className="text-foreground-secondary">{next}</span>
                    {resumeHref ? (
                      <Link href={resumeHref} className="text-accent">
                        View resume
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="text-foreground-muted"
                      onClick={() => (app.archived ? void restoreId(app.id) : setConfirmId(app.id))}
                    >
                      {app.archived ? "Restore" : "Archive"}
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
