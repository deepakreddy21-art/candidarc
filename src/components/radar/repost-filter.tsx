"use client";

import { cn } from "@/lib/utils";
import type { FreshnessTypeFilter } from "@/types/radar";

const OPTIONS: Array<{ value: FreshnessTypeFilter | "any"; label: string; hint: string }> = [
  { value: "any", label: "Any classification", hint: "Show all freshness types" },
  { value: "genuinely_new", label: "Genuinely new", hint: "No prior matching requisition" },
  { value: "new_or_reposted", label: "New or reposted", hint: "Fresh signal including board reposts" },
  { value: "reposted_only", label: "Reposted only", hint: "Previously known roles appearing again" },
  { value: "refreshed", label: "Refreshed", hint: "Same listing with content/timestamp updates" },
  { value: "reopened", label: "Reopened", hint: "Previously closed roles active again" },
];

export function RepostFilter({
  value,
  onChange,
  className,
}: {
  value: FreshnessTypeFilter | "any";
  onChange: (next: FreshnessTypeFilter | "any") => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("space-y-2", className)}>
      <legend className="text-sm font-medium text-foreground">Freshness type</legend>
      <div className="space-y-1.5" role="radiogroup" aria-label="Freshness type">
        {OPTIONS.map((opt) => {
          const checked = value === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-[12px] border px-3 py-2.5 transition-colors",
                checked
                  ? "border-[color-mix(in_oklab,var(--accent)_40%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
                  : "border-border bg-surface hover:bg-surface-2",
              )}
            >
              <input
                type="radio"
                name="freshness-type"
                className="mt-1"
                checked={checked}
                onChange={() => onChange(opt.value)}
              />
              <span>
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-foreground-muted">{opt.hint}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
