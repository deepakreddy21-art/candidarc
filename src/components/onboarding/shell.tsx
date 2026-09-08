"use client";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
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
      <div className="mx-auto grid min-h-dvh max-w-6xl lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <aside className="relative hidden overflow-hidden border-r border-border bg-[linear-gradient(160deg,#111318_0%,#1b2030_48%,#243044_100%)] px-10 py-10 text-white lg:flex lg:flex-col">
          <div className="absolute inset-0 opacity-40 [background:radial-gradient(circle_at_20%_20%,rgba(88,101,242,0.35),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(32,191,198,0.22),transparent_40%)]" />
          <div className="relative z-10 flex h-full flex-col">
            <Logo className="text-white" />
            <div className="mt-auto space-y-4 pb-6">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/55">
                Step {step + 1} of {ONBOARDING_STEPS.length}
              </p>
              <h1 className="font-serif text-3xl leading-tight text-white">{current.title}</h1>
              <p className="max-w-sm text-sm leading-relaxed text-white/70">{current.panel}</p>
            </div>
          </div>
        </aside>

        <section className="flex min-h-dvh flex-col">
          <header className="sticky top-0 z-20 border-b border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 lg:hidden">
                <Logo />
              </div>
              <p className="text-sm text-foreground-secondary">
                Step {step + 1} of {ONBOARDING_STEPS.length}
              </p>
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

          <div className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <div className="mx-auto w-full max-w-xl space-y-6">{children}</div>
          </div>

          <footer
            className={cn(
              "sticky bottom-0 border-t border-border bg-canvas/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-canvas/80 sm:px-8",
            )}
          >
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
