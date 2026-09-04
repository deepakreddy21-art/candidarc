"use client";

import { LayoutGrid, List, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ApplicationStatus } from "@/types/domain";

export type ApplicationFiltersState = {
  query: string;
  status: ApplicationStatus | "all";
  company?: string;
  roleFamily: string;
  readiness: "all" | "ready" | "in-progress" | "not-started";
  interview: "all" | "not-started" | "preparing" | "ready" | "completed";
};

/** Alias used by some callers */
export type ApplicationFilterValues = ApplicationFiltersState;

const STATUS_OPTIONS: Array<{ value: ApplicationFiltersState["status"]; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "researching", label: "Researching" },
  { value: "evidence", label: "Evidence" },
  { value: "resume", label: "Resume" },
  { value: "auditing", label: "Auditing" },
  { value: "final-qa", label: "Final QA" },
  { value: "ready", label: "Ready" },
  { value: "interviewing", label: "Interviewing" },
  { value: "archived", label: "Archived" },
];

export function ApplicationFilters({
  value,
  onChange,
  view,
  onViewChange,
  companies = [],
  roleFamilies,
  className,
}: {
  value: ApplicationFiltersState;
  onChange: (next: ApplicationFiltersState) => void;
  view?: "list" | "board";
  onViewChange?: (view: "list" | "board") => void;
  companies?: string[];
  roleFamilies: string[];
  className?: string;
}) {
  const company = value.company ?? "all";
  const hasFilters =
    value.query.trim() !== "" ||
    value.status !== "all" ||
    company !== "all" ||
    value.roleFamily !== "all" ||
    value.readiness !== "all" ||
    value.interview !== "all";

  function patch(partial: Partial<ApplicationFiltersState>) {
    onChange({ ...value, company, ...partial });
  }

  function clear() {
    onChange({
      query: "",
      status: "all",
      company: "all",
      roleFamily: "all",
      readiness: "all",
      interview: "all",
    });
  }

  return (
    <div
      className={cn("flex flex-col gap-3 rounded-xl border border-border bg-surface p-4", className)}
      role="search"
      aria-label="Filter applications"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="min-w-[12rem] flex-1 space-y-1.5">
          <Label htmlFor="app-filter-search">Search</Label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted"
              aria-hidden
            />
            <Input
              id="app-filter-search"
              value={value.query}
              onChange={(e) => patch({ query: e.target.value })}
              placeholder="Company, role, or next action"
              className="pl-9"
              autoComplete="off"
            />
          </div>
        </div>

        <FilterSelect
          id="app-filter-status"
          label="Status"
          value={value.status}
          onChange={(v) => patch({ status: v as ApplicationFiltersState["status"] })}
          options={STATUS_OPTIONS}
        />

        <FilterSelect
          id="app-filter-company"
          label="Company"
          value={company}
          onChange={(v) => patch({ company: v })}
          options={[
            { value: "all", label: "All companies" },
            ...companies.map((c) => ({ value: c, label: c })),
          ]}
        />

        <FilterSelect
          id="app-filter-family"
          label="Role family"
          value={value.roleFamily}
          onChange={(v) => patch({ roleFamily: v })}
          options={[
            { value: "all", label: "All families" },
            ...roleFamilies.map((f) => ({ value: f, label: f })),
          ]}
        />

        <FilterSelect
          id="app-filter-readiness"
          label="Readiness"
          value={value.readiness}
          onChange={(v) => patch({ readiness: v as ApplicationFiltersState["readiness"] })}
          options={[
            { value: "all", label: "All scores" },
            { value: "ready", label: "Ready (85+)" },
            { value: "in-progress", label: "In progress" },
            { value: "not-started", label: "Not started" },
          ]}
        />

        <FilterSelect
          id="app-filter-interview"
          label="Pipeline stage"
          value={value.interview}
          onChange={(v) => patch({ interview: v as ApplicationFiltersState["interview"] })}
          options={[
            { value: "all", label: "All pipeline stages" },
            { value: "not-started", label: "Not started" },
            { value: "preparing", label: "Preparing" },
            { value: "ready", label: "Ready" },
            { value: "completed", label: "Completed" },
          ]}
        />

        {onViewChange && view ? (
          <div className="space-y-1.5">
            <span className="text-sm font-medium text-foreground">View</span>
            <div className="flex gap-1 rounded-[12px] bg-surface-2 p-1" role="group" aria-label="View mode">
              <Button
                type="button"
                size="icon-sm"
                variant={view === "list" ? "secondary" : "ghost"}
                aria-pressed={view === "list"}
                aria-label="List view"
                onClick={() => onViewChange("list")}
              >
                <List />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant={view === "board" ? "secondary" : "ghost"}
                aria-pressed={view === "board"}
                aria-label="Board view"
                onClick={() => onViewChange("board")}
              >
                <LayoutGrid />
              </Button>
            </div>
          </div>
        ) : null}

        {hasFilters ? (
          <Button type="button" variant="ghost" size="sm" onClick={clear} className="shrink-0">
            <X className="h-4 w-4" />
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="w-full space-y-1.5 sm:w-[10.5rem]">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
