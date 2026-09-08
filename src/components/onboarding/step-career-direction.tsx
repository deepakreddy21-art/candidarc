"use client";

import { ChipInput } from "./chip-input";
import {
  INDUSTRY_SUGGESTIONS,
  ROLE_SUGGESTIONS,
  SENIORITY_OPTIONS,
  type OnboardingFormState,
} from "./types";

type Props = {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
  errors: Partial<Record<string, string>>;
};

export function StepCareerDirection({ form, onChange, errors }: Props) {
  return (
    <div className="space-y-6">
      <ChipInput
        id="target-roles"
        label="Target job titles"
        values={form.targetRoles}
        onChange={(targetRoles) => onChange({ targetRoles })}
        suggestions={[...ROLE_SUGGESTIONS]}
        placeholder="Search or type a role"
        error={errors.targetRoles}
      />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Seniority level</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SENIORITY_OPTIONS.map((option) => {
            const selected = form.seniority === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                className={
                  selected
                    ? "rounded-[11px] border border-accent bg-accent/10 px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    : "rounded-[11px] border border-border-strong bg-surface px-3 py-2 text-sm text-foreground-secondary hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                }
                onClick={() => onChange({ seniority: option.value })}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {errors.seniority ? (
          <p className="text-xs text-destructive" role="alert">
            {errors.seniority}
          </p>
        ) : null}
      </fieldset>

      <ChipInput
        id="target-companies"
        label="Target companies"
        values={form.targetCompanies}
        onChange={(targetCompanies) => onChange({ targetCompanies })}
        placeholder="Add a company"
        optional
      />

      <ChipInput
        id="target-industries"
        label="Industries or domains"
        values={form.targetIndustries}
        onChange={(targetIndustries) => onChange({ targetIndustries })}
        suggestions={[...INDUSTRY_SUGGESTIONS]}
        placeholder="Add an industry"
        optional
      />
    </div>
  );
}
