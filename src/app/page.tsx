"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LandingWorkflowJourney } from "@/components/applications/workflow-journey";
import { ProgressArc, ProgressBar } from "@/components/ui/feedback";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

const nav = [
  { href: "#product", label: "Product" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-students", label: "For students" },
  { href: "#security", label: "Security" },
];

const features = [
  {
    title: "Deep role intelligence",
    body: "Research the posting, company signals, and technology stack — then separate verified facts from careful inference.",
  },
  {
    title: "Evidence-backed claims",
    body: "Every metric and ownership statement traces to a STAR story you control. Unsupported claims never make the cut.",
  },
  {
    title: "Resume version lineage",
    body: "Watch V0 become V4 as each audit regenerates a cleaner draft. Scores move with accepted findings, not vanity edits.",
  },
  {
    title: "Sequential audit learning",
    body: "HR and engineering lenses alternate so readability and technical depth improve without erasing each other.",
  },
  {
    title: "Application Copilot",
    body: "Prepare answers from Career Truth and approved evidence, autofill with review, and keep submission under your control.",
  },
  {
    title: "Privacy and candidate control",
    body: "Exclude sensitive evidence, manage retention, and keep model-improvement preferences explicit.",
  },
];

export default function LandingPage() {
  const reduce = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [score, setScore] = useState(68);

  useEffect(() => {
    if (reduce) {
      setScore(91);
      return;
    }
    const id = window.setTimeout(() => setScore(91), 700);
    return () => window.clearTimeout(id);
  }, [reduce]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 arc-bg opacity-90" aria-hidden />
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-6 hidden items-center gap-6 md:flex" aria-label="Marketing">
            {nav.map((item) => (
              <a key={item.href} href={item.href} className="text-sm text-foreground-secondary hover:text-foreground">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
              Sign in
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
              Build my application
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            className="fixed inset-0 z-50 md:hidden"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close menu" onClick={() => setMobileOpen(false)} />
            <motion.div
              className="absolute inset-y-0 right-0 w-[min(100%,320px)] border-l border-border bg-canvas p-5 shadow-[var(--shadow-md)]"
              initial={reduce ? false : { x: 24 }}
              animate={{ x: 0 }}
              exit={{ x: 24 }}
            >
              <div className="mb-6 flex items-center justify-between">
                <Logo size="sm" />
                <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setMobileOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <nav className="flex flex-col gap-2" onClick={() => setMobileOpen(false)}>
                {nav.map((item) => (
                  <a key={item.href} href={item.href} className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                    {item.label}
                  </a>
                ))}
                <Link href="/sign-in" className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                  Sign in
                </Link>
                <Link href="/sign-up" className={cn(buttonVariants(), "mt-2")}>
                  Build my application
                </Link>
              </nav>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main>
        <section className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
          <div>
            <motion.p
              className="text-sm font-medium tracking-wide text-cyan"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Your evidence. Your story. Your next role.
            </motion.p>
            <motion.h1
              className="mt-4 font-serif text-[clamp(2.25rem,6vw,4.5rem)] leading-[1.05] tracking-tight text-balance"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.05 }}
            >
              A resume that learns before the interview begins.
            </motion.h1>
            <motion.p
              className="mt-5 max-w-xl text-base text-foreground-secondary sm:text-lg"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.1 }}
            >
              {product.name} researches the role, builds from verified evidence, audits every version through recruiter and
              engineering lenses, and turns the final resume into a personalized interview plan.
            </motion.p>
            <motion.div
              className="mt-8 flex flex-wrap items-center gap-3"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : 0.15 }}
            >
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Build my application
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                Explore the workflow
              </a>
            </motion.div>
          </div>

          <motion.div
            className="relative"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.12 }}
          >
            <div className="absolute -inset-4 rounded-[28px] bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--cyan)_14%,transparent),transparent_55%)]" aria-hidden />
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-md)]">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold">CI</span>
                  <div>
                    <p className="text-sm font-semibold">Cisco</p>
                    <p className="text-xs text-foreground-muted">CX AI Software Engineer</p>
                  </div>
                </div>
                <span className="rounded-full border border-[color-mix(in_oklab,var(--cyan)_30%,transparent)] bg-[color-mix(in_oklab,var(--cyan)_10%,transparent)] px-2.5 py-1 text-[11px] font-medium text-cyan">
                  Final ready
                </span>
              </div>
              <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr]">
                <ProgressArc value={score} size={108} label="score" />
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-foreground-muted">
                      <span>Evidence coverage</span>
                      <span className="font-mono">86%</span>
                    </div>
                    <ProgressBar value={86} tone="cyan" />
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {["HR1", "EM1", "HR2", "EM2"].map((label, i) => (
                      <motion.div
                        key={label}
                        className="rounded-lg border border-border bg-canvas px-2 py-2 text-center"
                        initial={reduce ? false : { opacity: 0.4 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: reduce ? 0 : 0.35 + i * 0.12 }}
                      >
                        <p className="font-mono text-[10px] text-foreground-muted">{label}</p>
                        <p className="mt-1 text-xs font-semibold text-success">Done</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="border-t border-border bg-canvas px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-foreground-muted">Highlighted improvement</p>
                <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">
                  <span className="line-through opacity-60">Improved RAG system performance and quality.</span>
                  <br />
                  <span className="text-foreground">
                    Owned RAG performance work that reduced response time from 2.1s to 820ms while keeping hallucinations below 2%.
                  </span>
                </p>
                <p className="mt-3 font-mono text-xs text-foreground-muted">68 → 76 → 83 → 88 → 91</p>
              </div>
            </div>
          </motion.div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y border-border bg-canvas/70 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-medium text-accent">Product story</p>
            <h2 className="mt-2 max-w-2xl font-serif text-[clamp(1.75rem,3.5vw,2.75rem)] tracking-tight text-balance">
              Twelve deliberate steps from role research to interview readiness.
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-foreground-secondary sm:text-base">
              Each audit reviews the newly regenerated draft — not the original — so learning compounds instead of looping.
            </p>
            <div className="mt-10">
              <LandingWorkflowJourney />
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="max-w-2xl font-serif text-[clamp(1.75rem,3.5vw,2.75rem)] tracking-tight">
              Built for candidates who refuse unsupported claims.
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, i) => (
                <motion.article
                  key={feature.title}
                  initial={reduce ? false : { opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: reduce ? 0 : i * 0.04 }}
                  className="rounded-2xl border border-border bg-surface p-5"
                >
                  <h3 className="text-[15px] font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{feature.body}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="for-students" className="scroll-mt-24 border-y border-border bg-canvas/70 py-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] tracking-tight">For students and early-career builders</h2>
              <p className="mt-3 text-sm text-foreground-secondary sm:text-base">
                Import projects, quantify coursework outcomes carefully, and rehearse ownership language before your first
                onsite. Prefer one-page clarity without inventing experience you do not have.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-6">
              <p className="text-sm font-medium">What stays honest</p>
              <ul className="mt-3 space-y-2 text-sm text-foreground-secondary">
                <li>Evidence confidence labels on every claim</li>
                <li>Mistake memory that blocks unsupported infra language</li>
                <li>Application answers tied only to verified stories</li>
              </ul>
              <Link href="/sign-up" className={cn(buttonVariants({ variant: "secondary" }), "mt-5 inline-flex")}>
                Start with a student profile
              </Link>
            </div>
          </div>
        </section>

        <section id="security" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] tracking-tight">Security and control</h2>
            <p className="mt-3 max-w-2xl text-sm text-foreground-secondary sm:text-base">
              Export your data, delete documents and receipts, set retention windows, and decide whether evidence is
              share-safe. Account deletion always asks for confirmation.
            </p>
            <Link href="/sign-up" className={cn(buttonVariants(), "mt-6 inline-flex")}>
              Review privacy controls after signup
            </Link>
          </div>
        </section>

        <section className="border-t border-border bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--accent)_6%,transparent))] py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-serif text-[clamp(1.85rem,4vw,2.75rem)] tracking-tight text-balance">
              Build the application you can defend in the room.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-foreground-secondary sm:text-base">
              Start with one role. Leave with a verified resume, an audit trail, and an interview plan.
            </p>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "mt-8 inline-flex")}>
              Build my application
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 text-sm text-foreground-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo size="sm" />
          <p>
            {product.name} · {product.tagline}
          </p>
          <a href={`mailto:${product.supportEmail}`} className="hover:text-foreground">
            {product.supportEmail}
          </a>
        </div>
      </footer>
    </div>
  );
}
