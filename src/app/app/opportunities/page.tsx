"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { ApplicationCard, ApplicationBoardColumn } from "@/components/applications/application-card";
import {
  ApplicationFilters,
  type ApplicationFiltersState,
} from "@/components/applications/application-filters";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/feedback";
import { applications as seedApps } from "@/data/seed";
import { api } from "@/services/api";
import type { Application } from "@/types/domain";
import { cn } from "@/lib/utils";

export default function OpportunitiesPage() {
  const [apps, setApps] = useState<Application[]>(seedApps.filter((a) => !a.archived));
  const [view, setView] = useState<"list" | "board">("list");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filters, setFilters] = useState<ApplicationFiltersState>({
    query: "",
    status: "all",
    company: "all",
    roleFamily: "all",
    readiness: "all",
    interview: "all",
  });

  const companies = useMemo(() => [...new Set(apps.map((a) => a.company))], [apps]);
  const roleFamilies = useMemo(() => [...new Set(apps.map((a) => a.roleFamily))], [apps]);

  const filtered = useMemo(() => {
    return apps.filter((app) => {
      const q = filters.query.trim().toLowerCase();
      if (q && !`${app.company} ${app.role} ${app.nextAction}`.toLowerCase().includes(q)) return false;
      if (filters.status !== "all" && app.status !== filters.status) return false;
      if (filters.company !== "all" && app.company !== filters.company) return false;
      if (filters.roleFamily !== "all" && app.roleFamily !== filters.roleFamily) return false;
      if (filters.interview !== "all" && app.interviewStatus !== filters.interview) return false;
      if (filters.readiness === "ready" && app.resumeScore < 85) return false;
      if (filters.readiness === "not-started" && app.resumeScore > 0) return false;
      if (filters.readiness === "in-progress" && !(app.resumeScore > 0 && app.resumeScore < 85)) return false;
      return true;
    });
  }, [apps, filters]);

  async function archiveIds(ids: string[]) {
    await api.archiveApplications(ids);
    setApps((prev) => prev.filter((a) => !ids.includes(a.id)));
    setSelected([]);
    setConfirmOpen(false);
    toast.success(ids.length === 1 ? "Opportunity archived" : `${ids.length} opportunities archived`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Opportunities"
        description="Track research, resumes, audits, and application packages for every role."
        actions={
          <Link href="/app/opportunities/new" className={buttonVariants()}>
            New opportunity
          </Link>
        }
      />

      <ApplicationFilters
        value={filters}
        onChange={setFilters}
        view={view}
        onViewChange={setView}
        companies={companies}
        roleFamilies={roleFamilies}
      />

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3">
          <span className="text-sm">{selected.length} selected</span>
          <Button type="button" size="sm" variant="destructive" onClick={() => setConfirmOpen(true)}>
            Archive selected
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="No applications match"
          description="Adjust filters or start a new role research flow."
          action={
            <Link href="/app/opportunities/new" className={buttonVariants()}>
              New opportunity
            </Link>
          }
        />
      ) : view === "list" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((app) => (
            <ApplicationCard
              key={app.id}
              application={app}
              selected={selected.includes(app.id)}
              onSelect={(id, checked) =>
                setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
              }
              onArchive={(id) => {
                setSelected([id]);
                setConfirmOpen(true);
              }}
            />
          ))}
        </div>
      ) : (
        <div className={cn("flex gap-4 overflow-x-auto pb-2")}>
          {[
            { title: "Researching", status: "researching" },
            { title: "Auditing", status: "auditing" },
            { title: "Final QA", status: "final-qa" },
            { title: "Ready", status: "ready" },
          ].map((col) => (
            <ApplicationBoardColumn
              key={col.status}
              title={col.title}
              applications={filtered.filter((a) => a.status === col.status)}
              onArchive={(id) => {
                setSelected([id]);
                setConfirmOpen(true);
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive application{selected.length > 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              Archived applications leave the active board. You can still restore them later from saved views.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={() => void archiveIds(selected)}>
              Confirm archive
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
