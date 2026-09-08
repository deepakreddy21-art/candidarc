"use client";

import { Input, Label } from "@/components/ui/input";
import { ChipInput, MultiToggle } from "./chip-input";
import {
  JOB_TYPE_OPTIONS,
  LOCATION_SUGGESTIONS,
  WORKPLACE_OPTIONS,
  type OnboardingFormState,
} from "./types";

type Props = {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
  errors: Partial<Record<string, string>>;
};

export function StepWorkPreferences({ form, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <MultiToggle
        legend="Job types"
        options={JOB_TYPE_OPTIONS}
        values={form.jobTypes}
        onChange={(jobTypes) => onChange({ jobTypes })}
        error={errors.jobTypes}
      />

      <MultiToggle
        legend="Workplace modes"
        options={WORKPLACE_OPTIONS}
        values={form.workplaceModes}
        onChange={(workplaceModes) => onChange({ workplaceModes })}
        error={errors.workplaceModes}
      />

      <ChipInput
        id="preferred-locations"
        label="Preferred locations"
        values={form.preferredLocations}
        onChange={(preferredLocations) => onChange({ preferredLocations })}
        suggestions={[...LOCATION_SUGGESTIONS]}
        placeholder="City, region, or Remote"
        optional
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">
          Willing to relocate <span className="font-normal text-foreground-muted">(optional)</span>
        </legend>
        <div className="flex gap-2">
          {[
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ].map((option) => {
            const selected = form.willingToRelocate === option.value;
            return (
              <button
                key={String(option.value)}
                type="button"
                aria-pressed={selected}
                className={
                  selected
                    ? "rounded-[11px] border border-accent bg-accent/10 px-3 py-2 text-sm"
                    : "rounded-[11px] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground-secondary"
                }
                onClick={() => onChange({ willingToRelocate: option.value })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">Work authorization</p>
        <p className="text-xs text-foreground-muted">
          Kept private on your account. Used only to filter jobs that match your situation.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="work-auth">Authorization status (optional)</Label>
          <Input
            id="work-auth"
            value={form.workAuthorization}
            onChange={(e) => onChange({ workAuthorization: e.target.value })}
            placeholder="e.g. Authorized to work in the U.S."
          />
        </div>
        <fieldset className="space-y-2 pt-2">
          <legend className="text-sm font-medium text-foreground">
            Need visa sponsorship? <span className="font-normal text-foreground-muted">(optional)</span>
          </legend>
          <div className="flex gap-2">
            {[
              { value: true, label: "Yes" },
              { value: false, label: "No" },
            ].map((option) => {
              const selected = form.requiresSponsorship === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  aria-pressed={selected}
                  className={
                    selected
                      ? "rounded-[11px] border border-accent bg-accent/10 px-3 py-2 text-sm"
                      : "rounded-[11px] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground-secondary"
                  }
                  onClick={() => onChange({ requiresSponsorship: option.value })}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="salary">
          Salary preference <span className="font-normal text-foreground-muted">(optional)</span>
        </Label>
        <Input
          id="salary"
          value={form.salaryPreference}
          onChange={(e) => onChange({ salaryPreference: e.target.value })}
          placeholder="e.g. $140k+ base"
        />
      </div>
    </div>
  );
}
