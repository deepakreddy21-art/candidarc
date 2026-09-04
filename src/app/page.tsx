"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

const nav = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#security", label: "Security" },
];

const steps = [
  { title: "Add experience", body: "Build your Career Profile with verified roles, projects, and outcomes you can stand behind." },
  { title: "Paste the job description", body: "Drop in the posting or URL. CandidArc researches the role and maps requirements to your evidence." },
  { title: "Review and refine", body: "See a paper-sized preview, ask for refinements, and confirm any technology claims before export." },
  { title: "Download PDF or Word", body: "Get ATS-safe documents that match what you reviewed — ready to submit on your terms." },
];

const features = [
  {
    title: "Role-aware research",
    body: "CandidArc reads the posting and company context before tailoring — not generic resume filler.",
  },
  {
    title: "Evidence-backed tailoring",
    body: "Claims trace to experience you control. Unsupported statements stay out of the final document.",
  },
  {
    title: "Professional documents",
    body: "Preview, PDF, and Word share the same content in a clean single-column layout recruiters and ATS systems can parse.",
  },
  {
    title: "You stay in control",
    body: "Refine wording, exclude sensitive stories, and download when you are satisfied — nothing submits automatically.",
  },
];

export default function LandingPage() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = !mounted || !!reduceMotion;

  useEffect(() => {
    setMounted(true);
  }, []);

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
              Get started
            </Link>
            <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
              <Menu className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div className="fixed inset-0 z-50 md:hidden" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
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
                  Get started
                </Link>
              </nav>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main>
        <section className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-20">
          <div>
            <motion.p className="text-sm font-medium tracking-wide text-cyan" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              Tailored resumes from verified experience
            </motion.p>
            <motion.h1
              className="mt-4 font-serif text-[clamp(2.25rem,6vw,4.5rem)] leading-[1.05] tracking-tight text-balance"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Add experience. Paste the JD. Download a resume you can defend.
            </motion.h1>
            <motion.p
              className="mt-5 max-w-xl text-base text-foreground-secondary sm:text-lg"
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {product.name} researches the role, tailors your verified experience, and prepares professional PDF and Word documents for your review.
            </motion.p>
            <motion.div className="mt-8 flex flex-wrap items-center gap-3" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Get started
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                See how it works
              </a>
            </motion.div>
          </div>

          <motion.div className="relative" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="relative overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-md)]">
              <div className="border-b border-border px-5 py-4">
                <p className="text-sm font-semibold">Your tailored resume</p>
                <p className="text-xs text-foreground-muted">Preview · PDF · Word</p>
              </div>
              <div className="space-y-3 bg-white p-6 text-black">
                <div>
                  <p className="text-lg font-semibold">Your name</p>
                  <p className="text-xs text-neutral-600">Platform Engineer · Target company</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Summary</p>
                  <p className="mt-1 text-xs leading-relaxed">Evidence-backed summary tailored to the pasted job description.</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">Experience</p>
                  <ul className="mt-1 list-disc pl-4 text-xs leading-relaxed">
                    <li>Quantified accomplishment mapped to a verified project.</li>
                    <li>Role-specific keyword woven into a clear outcome.</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 border-y border-border bg-canvas/70 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="text-sm font-medium text-accent">How it works</p>
            <h2 className="mt-2 max-w-2xl font-serif text-[clamp(1.75rem,3.5vw,2.75rem)] tracking-tight text-balance">
              Four steps from career profile to downloadable resume.
            </h2>
            <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <article key={step.title} className="rounded-2xl border border-border bg-surface p-5">
                  <p className="font-mono text-xs text-foreground-muted">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 text-[15px] font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="product" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="max-w-2xl font-serif text-[clamp(1.75rem,3.5vw,2.75rem)] tracking-tight">
              Built for candidates who want accuracy, not autopilot applications.
            </h2>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {features.map((feature) => (
                <article key={feature.title} className="rounded-2xl border border-border bg-surface p-5">
                  <h3 className="text-[15px] font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">{feature.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="security" className="scroll-mt-24 border-y border-border bg-canvas/70 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-serif text-[clamp(1.75rem,3.5vw,2.5rem)] tracking-tight">Security and control</h2>
            <p className="mt-3 max-w-2xl text-sm text-foreground-secondary sm:text-base">
              Export your data, delete documents, set retention preferences, and decide what evidence is share-safe. You review every download before it leaves CandidArc.
            </p>
            <Link href="/sign-up" className={cn(buttonVariants(), "mt-6 inline-flex")}>
              Create your account
            </Link>
          </div>
        </section>

        <section className="border-t border-border bg-[linear-gradient(180deg,transparent,color-mix(in_oklab,var(--accent)_6%,transparent))] py-20">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="font-serif text-[clamp(1.85rem,4vw,2.75rem)] tracking-tight text-balance">
              Paste a job description. Get a resume worth sending.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-foreground-secondary sm:text-base">
              Start with one role and leave with researched tailoring plus PDF and Word downloads.
            </p>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "mt-8 inline-flex")}>
              Get started
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
