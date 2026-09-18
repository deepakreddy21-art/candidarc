"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/feedback";
import { ONBOARDING_STEPS } from "./types";

type OnboardingShellProps = {
  step: number;
  saving: boolean;
  saveStatus: string | null;
  onBack: () => void;
  onContinue: () => void;
  onLogout: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  children: React.ReactNode;
};

export function OnboardingShell({
  step,
  saving,
  saveStatus,
  onBack,
  onContinue,
  onLogout,
  continueLabel = "Continue",
  continueDisabled,
  children,
}: OnboardingShellProps) {
  const current = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];
  const progress = ((step + 1) / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="min-h-dvh bg-canvas text-foreground">
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[minmax(0,0.38fr)_minmax(0,0.62fr)]">
        <aside className="relative hidden border-r border-border bg-mint px-8 py-10 lg:flex lg:flex-col">
          <Logo />
          <div className="mt-10 max-w-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">Your path</p>
            <svg className="mt-4 h-20 w-full" viewBox="0 0 240 80" fill="none" aria-hidden>
              <path d="M16 60 C 70 12, 170 12, 224 60" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="16" cy="60" r="4" fill="var(--lime)" />
              <circle cx="120" cy="20" r="4" fill="var(--accent)" />
              <circle cx="224" cy="60" r="4" fill="var(--lime)" />
            </svg>
          </div>
          <div className="mt-auto max-w-sm space-y-3 pb-4">
            <h1 className="font-serif text-3xl leading-tight text-foreground">{current.title}</h1>
            <p className="text-sm leading-relaxed text-foreground-secondary">{current.panel}</p>
          </div>
        </aside>

        <section className="flex min-h-dvh flex-col lg:h-dvh">
          <header className="shrink-0 border-b border-border bg-canvas px-4 py-3 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="lg:hidden">
                  <Logo />
                </div>
                <p className="text-sm text-foreground-secondary" data-testid="onboarding-step">
                  Step {step + 1} of {ONBOARDING_STEPS.length}
                </p>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={onLogout}>
                Log out
              </Button>
            </div>
            <div className="mt-3">
              <ProgressBar value={progress} />
            </div>
            <div className="mt-3 lg:hidden">
              <h1 className="font-serif text-2xl leading-tight">{current.title}</h1>
              <p className="mt-1 text-sm text-foreground-secondary">{current.panel}</p>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto w-full max-w-xl space-y-6">
              {children}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-canvas px-4 py-3 sm:px-8">
            <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={onBack} disabled={step === 0 || saving}>
                Back
              </Button>
              <div className="flex items-center gap-3">
                <p className="hidden text-xs text-foreground-muted sm:block" aria-live="polite">
                  {saving ? "Saving…" : saveStatus}
                </p>
                <Button type="button" onClick={onContinue} disabled={continueDisabled || saving}>
                  {continueLabel}
                </Button>
              </div>
            </div>
            <p className="mx-auto mt-2 max-w-xl text-xs text-foreground-muted sm:hidden" aria-live="polite">
              {saving ? "Saving…" : saveStatus}
            </p>
          </footer>
        </section>
      </div>
    </div>
  );
}
