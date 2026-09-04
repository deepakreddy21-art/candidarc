"use client";

import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FreshnessBasis, FreshnessPreset } from "@/types/radar";

export const FRESHNESS_PRESETS: Array<{ value: FreshnessPreset; label: string }> = [
  { value: "30m", label: "Last 30 minutes" },
  { value: "1h", label: "Last 1 hour" },
  { value: "2h", label: "Last 2 hours" },
  { value: "3h", label: "Last 3 hours" },
  { value: "6h", label: "Last 6 hours" },
  { value: "12h", label: "Last 12 hours" },
  { value: "24h", label: "Last 24 hours" },
  { value: "48h", label: "Last 48 hours" },
  { value: "3d", label: "Last 3 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

export const FRESHNESS_BASIS_OPTIONS: Array<{ value: FreshnessBasis; label: string }> = [
  { value: "originally_posted", label: "Originally posted" },
  { value: "source_posted", label: "Posted on selected source" },
  { value: "reposted", label: "Reposted" },
  { value: "discovered", label: "Discovered by CandidArc" },
  { value: "last_verified", label: "Last verified" },
];

export type FreshnessControlsValue = {
  preset: FreshnessPreset | "";
  basis: FreshnessBasis;
  customStart?: string;
  customEnd?: string;
  timezone?: string;
};

export function FreshnessControls({
  value,
  onChange,
  compact,
  className,
}: {
  value: FreshnessControlsValue;
  onChange: (next: FreshnessControlsValue) => void;
  compact?: boolean;
  className?: string;
}) {
  const tz =
    value.timezone ??
    (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "gap-3")}>
        <div className="space-y-1.5">
          <Label htmlFor="freshness-preset">Freshness window</Label>
          <select
            id="freshness-preset"
            value={value.preset}
            onChange={(e) =>
              onChange({ ...value, preset: e.target.value as FreshnessPreset | "" })
            }
            className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
          >
            <option value="">Any time</option>
            {FRESHNESS_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="freshness-basis">Freshness basis</Label>
          <select
            id="freshness-basis"
            value={value.basis}
            onChange={(e) => onChange({ ...value, basis: e.target.value as FreshnessBasis })}
            className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
          >
            {FRESHNESS_BASIS_OPTIONS.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {value.preset === "custom" ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface-2/60 p-3">
          <p className="text-xs text-foreground-muted">
            Custom range in your timezone ({tz}). Stored as UTC.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="freshness-start">Start</Label>
              <input
                id="freshness-start"
                type="datetime-local"
                value={value.customStart ?? ""}
                onChange={(e) => onChange({ ...value, customStart: e.target.value, timezone: tz })}
                className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="freshness-end">End</Label>
              <input
                id="freshness-end"
                type="datetime-local"
                value={value.customEnd ?? ""}
                onChange={(e) => onChange({ ...value, customEnd: e.target.value, timezone: tz })}
                className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
