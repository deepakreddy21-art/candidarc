"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { ArcMark, Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { ONBOARDING_STEPS } from "./types";

type OnboardingShellProps = {
  step: number; saving: boolean; saveStatus: string | null;
  onBack: () => void; onContinue: () => void; onLogout: () => void;
  continueLabel?: string; continueDisabled?: boolean; reviewingImport?: boolean;
  children: React.ReactNode;
};

export function OnboardingShell({ step, saving, saveStatus, onBack, onContinue, onLogout,
  continueLabel = "Continue", continueDisabled, reviewingImport = false, children }: OnboardingShellProps) {
  const current = ONBOARDING_STEPS[step] ?? ONBOARDING_STEPS[0];
  const saved = !saving && saveStatus === "Saved";
  return (
    <main className="focus-onboarding">
      <aside className="focus-onboarding-aside">
        <Logo size="lg" />
        <div className="focus-onboarding-art">
          <Image src="/brand/onboarding-organized.webp" width={1536} height={1024} priority sizes="(max-width: 1023px) 0px, 44vw" alt="A résumé unfolds into organized Contact, Experience, Education and Projects cards, connected by CandidArc’s green ribbon." />
        </div>
        <div className="focus-onboarding-message">
          <h2>{step === 1 ? <>Your experience.<br />Already organized.</> : current.title}</h2>
          <p>{step === 1 ? "Bring your résumé. We’ll help you make it yours." : current.panel}</p>
        </div>
        <div className="focus-onboarding-signoff" aria-hidden="true"><span>More<br />opportunities<br />ahead.</span><div><ArcMark /><p>PEOPLE<br />PROGRESS<br />FURTHER</p></div></div>
      </aside>
      <section className="focus-onboarding-main">
        <header className="focus-onboarding-header">
          <div className="lg:hidden"><Logo /></div>
          <div className="focus-onboarding-step">
            <p data-testid="onboarding-step">Step {step + 1} of {ONBOARDING_STEPS.length}</p>
            <ol aria-label="Onboarding progress">{ONBOARDING_STEPS.map((item, index) => <li key={item.id} data-complete={index <= step} aria-current={index === step ? "step" : undefined}><span className="sr-only">{item.title}{index < step ? ", completed" : ""}</span></li>)}</ol>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onLogout}>Log out</Button>
        </header>
        <div className="focus-onboarding-scroll">
          <div className="focus-onboarding-content">
            <div className="focus-onboarding-heading">
              <h1>{reviewingImport ? "Review your experience" : step === 1 ? "Bring your experience" : current.title}</h1>
              <p>{reviewingImport ? "We’ve organized your résumé. Check the details below." : step === 1 ? "Upload your résumé or start with a few details." : current.panel}</p>
            </div>
            {children}
          </div>
        </div>
        <footer className="focus-onboarding-footer">
          <Button type="button" variant="secondary" onClick={onBack} disabled={step === 0 || saving}>Back</Button>
          <Button type="button" onClick={onContinue} disabled={continueDisabled || saving}>{continueLabel}</Button>
          <p role="status" className={saved ? "save-confirmed" : ""}>{saved && <Check size={17} aria-hidden />}{saving ? "Saving…" : saved ? "All changes saved" : saveStatus}</p>
        </footer>
      </section>
    </main>
  );
}
