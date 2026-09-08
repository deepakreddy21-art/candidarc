"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { normalizeList } from "./types";

type ChipInputProps = {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  optional?: boolean;
  hint?: string;
  error?: string | null;
};

export function ChipInput({
  id,
  label,
  values,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter",
  optional,
  hint,
  error,
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    if (!q) return suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 6);
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && !values.some((v) => v.toLowerCase() === s.toLowerCase()))
      .slice(0, 6);
  }, [draft, suggestions, values]);

  function commit(raw: string) {
    const next = normalizeList([...values, raw]);
    onChange(next);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
          {optional ? <span className="ml-1 font-normal text-foreground-muted">(optional)</span> : null}
        </label>
      </div>
      {hint ? <p className="text-xs text-foreground-muted">{hint}</p> : null}
      <div
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-2 rounded-[12px] border bg-surface px-2 py-1.5",
          error ? "border-destructive" : "border-border-strong",
        )}
      >
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-foreground"
          >
            {value}
            <button
              type="button"
              className="rounded-full p-0.5 text-foreground-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <Input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              if (draft.trim()) commit(draft);
            }
            if (e.key === "Backspace" && !draft && values.length) {
              onChange(values.slice(0, -1));
            }
          }}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete="off"
        />
      </div>
      {filtered.length > 0 ? (
        <ul className="flex flex-wrap gap-2" role="listbox" aria-label={`${label} suggestions`}>
          {filtered.map((suggestion) => (
            <li key={suggestion}>
              <button
                type="button"
                className="rounded-full border border-border px-2.5 py-1 text-xs text-foreground-secondary hover:border-border-strong hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => commit(suggestion)}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type MultiToggleProps = {
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  values: string[];
  onChange: (values: string[]) => void;
  optional?: boolean;
  error?: string | null;
};

export function MultiToggle({ legend, options, values, onChange, optional, error }: MultiToggleProps) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">
        {legend}
        {optional ? <span className="ml-1 font-normal text-foreground-muted">(optional)</span> : null}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = values.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              className={cn(
                "rounded-[11px] border px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                selected
                  ? "border-accent bg-accent/10 text-foreground"
                  : "border-border-strong bg-surface text-foreground-secondary hover:bg-surface-2",
              )}
              onClick={() =>
                onChange(
                  selected ? values.filter((v) => v !== option.value) : [...values, option.value],
                )
              }
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
