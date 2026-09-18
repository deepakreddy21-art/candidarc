"use client";

import { Search } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CandidateApplicationStatus } from "@/lib/application-presentation";
import { CANDIDATE_STATUS_OPTIONS } from "@/lib/application-presentation";

/** @deprecated Prefer inline filters on Applications page. Kept for test compatibility. */
export type ApplicationFiltersState = {
  query: string;
  status: CandidateApplicationStatus | "all" | string;
  company?: string;
  roleFamily: string;
  readiness: "all" | "ready" | "in-progress" | "not-started";
  interview: "all" | "not-started" | "preparing" | "ready" | "completed";
};

export type ApplicationFilterValues = ApplicationFiltersState;

export function ApplicationFilters({
  value,
  onChange,
  className,
}: {
  value: ApplicationFiltersState;
  onChange: (next: ApplicationFiltersState) => void;
  view?: "list" | "board";
  onViewChange?: (view: "list" | "board") => void;
  companies?: string[];
  roleFamilies?: string[];
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end", className)}
      role="search"
      aria-label="Filter applications"
    >
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
            onChange={(e) => onChange({ ...value, query: e.target.value })}
            placeholder="Company or role"
            className="pl-9"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-1.5 sm:w-52">
        <Label htmlFor="app-filter-status">Application status</Label>
        <select
          id="app-filter-status"
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          value={value.status}
          onChange={(e) => onChange({ ...value, status: e.target.value })}
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
  );
}
