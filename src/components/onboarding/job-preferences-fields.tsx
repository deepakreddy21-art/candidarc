"use client";

import { StepCareerDirection } from "./step-career-direction";
import { StepWorkPreferences } from "./step-work-preferences";
import type { OnboardingFormState } from "./types";

export function JobPreferencesFields(props: {
  form: OnboardingFormState;
  onChange: (patch: Partial<OnboardingFormState>) => void;
  errors: Partial<Record<string, string>>;
}) {
  return <div className="space-y-7">
    <StepCareerDirection {...props} section="required" />
    <StepWorkPreferences {...props} section="required" />
    <details className="rounded-xl border border-border p-4">
      <summary className="cursor-pointer font-medium">More preferences (optional)</summary>
      <p className="mt-2 text-sm text-foreground-secondary">Companies, industries, salary and work authorization. You can update these later.</p>
      <div className="mt-5 space-y-6">
        <StepCareerDirection {...props} section="optional" />
        <StepWorkPreferences {...props} section="optional" />
      </div>
    </details>
  </div>;
}
