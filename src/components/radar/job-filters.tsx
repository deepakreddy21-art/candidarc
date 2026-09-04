"use client";

import { Input, Label } from "@/components/ui/input";
import { FreshnessControls, type FreshnessControlsValue } from "@/components/radar/freshness-controls";
import { RepostFilter } from "@/components/radar/repost-filter";
import { cn } from "@/lib/utils";
import type { FreshnessTypeFilter, RemotePolicy } from "@/types/radar";

export type JobFiltersState = {
  company: string;
  remote: RemotePolicy | "any";
  verifiedOpenOnly: boolean;
  companyDirectOnly: boolean;
  matchScoreMin: number;
  excludeOriginalOlderThanDays?: number;
  maxRepostCount?: number;
  requireKnownOriginalDate: boolean;
  hidePossibleDuplicates: boolean;
  freshness: FreshnessControlsValue;
  freshnessType: FreshnessTypeFilter | "any";
};

export const defaultJobFilters = (): JobFiltersState => ({
  company: "",
  remote: "any",
  verifiedOpenOnly: false,
  companyDirectOnly: false,
  matchScoreMin: 0,
  requireKnownOriginalDate: false,
  hidePossibleDuplicates: false,
  freshness: {
    preset: "",
    basis: "discovered",
  },
  freshnessType: "any",
});

export function JobFilters({
  value,
  onChange,
  className,
}: {
  value: JobFiltersState;
  onChange: (next: JobFiltersState) => void;
  className?: string;
}) {
  function patch(partial: Partial<JobFiltersState>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className={cn("space-y-5", className)} aria-label="Job filters">
      <div className="space-y-1.5">
        <Label htmlFor="filter-company">Company</Label>
        <Input
          id="filter-company"
          value={value.company}
          onChange={(e) => patch({ company: e.target.value })}
          placeholder="e.g. Cisco"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-remote">Remote policy</Label>
        <select
          id="filter-remote"
          value={value.remote}
          onChange={(e) => patch({ remote: e.target.value as JobFiltersState["remote"] })}
          className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
        >
          <option value="any">Any</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
          <option value="onsite">Onsite</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="filter-match">Minimum match score ({value.matchScoreMin})</Label>
        <input
          id="filter-match"
          type="range"
          min={0}
          max={95}
          step={5}
          value={value.matchScoreMin}
          onChange={(e) => patch({ matchScoreMin: Number(e.target.value) })}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <FreshnessControls
        value={value.freshness}
        onChange={(freshness) => patch({ freshness })}
      />

      <RepostFilter
        value={value.freshnessType}
        onChange={(freshnessType) => patch({ freshnessType })}
      />

      <div className="space-y-2">
        <Toggle
          id="verified-open"
          label="Verified open only"
          checked={value.verifiedOpenOnly}
          onChange={(verifiedOpenOnly) => patch({ verifiedOpenOnly })}
        />
        <Toggle
          id="company-direct"
          label="Company-direct only"
          checked={value.companyDirectOnly}
          onChange={(companyDirectOnly) => patch({ companyDirectOnly })}
        />
        <Toggle
          id="known-original"
          label="Require known original date"
          checked={value.requireKnownOriginalDate}
          onChange={(requireKnownOriginalDate) => patch({ requireKnownOriginalDate })}
        />
        <Toggle
          id="hide-dupes"
          label="Hide possible duplicates"
          checked={value.hidePossibleDuplicates}
          onChange={(hidePossibleDuplicates) => patch({ hidePossibleDuplicates })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="max-original-age">Exclude originally older than (days)</Label>
          <Input
            id="max-original-age"
            type="number"
            min={1}
            placeholder="e.g. 7"
            value={value.excludeOriginalOlderThanDays ?? ""}
            onChange={(e) =>
              patch({
                excludeOriginalOlderThanDays: e.target.value
                  ? Number(e.target.value)
                  : undefined,
              })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-reposts">Max repost count</Label>
          <Input
            id="max-reposts"
            type="number"
            min={0}
            placeholder="Any"
            value={value.maxRepostCount ?? ""}
            onChange={(e) =>
              patch({
                maxRepostCount: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex items-center gap-2.5 text-sm">
      <input
        id={id}
        type="checkbox"
        className="h-4 w-4 rounded border-border-strong"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
