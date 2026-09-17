/** Canonical customer onboarding is three steps. Historical four-step progress is mapped. */
export const ONBOARDING_FLOW_VERSION = 3;
export const ONBOARDING_LAST_STEP = 2;

export function mapLoadedOnboardingStep(savedStep: number | undefined, flowVersion?: number): number {
  const step = typeof savedStep === "number" && Number.isFinite(savedStep) ? savedStep : 0;
  if (flowVersion === ONBOARDING_FLOW_VERSION) {
    return Math.min(Math.max(step, 0), ONBOARDING_LAST_STEP);
  }
  if (step <= 1) return 0;
  if (step === 2) return 1;
  return 2;
}
