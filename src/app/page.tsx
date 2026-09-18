"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ArrowUpRight, Menu, Pause, Play, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ArcStory } from "@/components/brand/arc-story";
import { LayeredResumeDemo } from "@/components/brand/layered-resume-demo";
import { Button, buttonVariants } from "@/components/ui/button";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [compareMode, setCompareMode] = useState<"original" | "tailored">("tailored");
  const [showReasoning, setShowReasoning] = useState(false);
  const reduce = !mounted || !!reduceMotion;
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!demoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDemoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    dialogRef.current?.querySelector<HTMLElement>("button, [href], video")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [demoOpen]);

  return (
    <div className="min-h-dvh bg-white text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Logo />
          <div className="ml-auto flex items-center gap-3">
            <a href="#difference" className="hidden text-sm font-medium text-foreground-secondary hover:text-foreground sm:inline">
              See the difference
            </a>
            <Link href="/sign-in" className="hidden text-sm font-medium text-foreground-secondary hover:text-foreground sm:inline">
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className={cn(buttonVariants({ size: "sm" }), "hidden rounded-full px-4 sm:inline-flex")}
            >
              Get started
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "sm:hidden")}>
              Sign in
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
              className="absolute inset-y-0 right-0 w-[min(100%,320px)] border-l border-border bg-surface p-5 shadow-[var(--shadow-md)]"
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
                <a href="#difference" className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                  See the difference
                </a>
                <a href="#how-it-works" className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                  How it works
                </a>
                <Link href="/sign-in" className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                  Sign in
                </Link>
                <Link href="/sign-up" className={cn(buttonVariants(), "mt-2 rounded-full")}>
                  Get started
                </Link>
              </nav>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main>
        {/* Approved hero composition */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 arc-bg" aria-hidden />
          <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-20 pt-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-8 lg:pb-24 lg:pt-16">
            <div className="max-w-xl">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mint)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground">
                <ArrowUpRight className="h-3 w-3 text-headline" aria-hidden />
                Your next move starts here
              </p>
              <h1 className="mt-5 text-[clamp(2rem,4.6vw,3.25rem)] font-bold leading-[1.12] tracking-tight text-foreground">
                Get noticed for
                <span className="block text-headline">what you can do.</span>
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-foreground-secondary">
                Find the right roles. Understand the team. Build a resume that brings your strongest experience forward.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
                  Build my resume
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-headline"
                  onClick={() => setDemoOpen(true)}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-white">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </span>
                  See it in action
                </button>
              </div>
              <p className="mt-5 text-sm text-foreground-secondary">Have a resume? Bring it. Starting fresh? Start here.</p>
            </div>

            <div className="pb-10 pt-4 lg:pb-6 lg:pt-2">
              <LayeredResumeDemo />
            </div>
          </div>
        </section>

        <section id="how-it-works" className="border-t border-border bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">How it works</h2>
            <p className="mt-2 max-w-2xl text-foreground-secondary">A short path from profile to a résumé you can defend.</p>
            <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  title: "Upload or build your profile",
                  body: "Have a résumé? Upload it. Starting fresh? We’ll help you build one from experience you already have.",
                },
                {
                  title: "Find and select a role",
                  body: "Browse Jobs with filters that match how you work — then open a posting that fits.",
                },
                {
                  title: "Understand fit and research",
                  body: "See why a role matches, plus sourced team signals connected to your profile.",
                },
                {
                  title: "Tailor, review, download",
                  body: "Generate a résumé around real experience, preview it, and export PDF or Word.",
                },
              ].map((step, index) => (
                <li key={step.title} className="rounded-2xl border border-border bg-white p-4 shadow-[var(--shadow-sm)]">
                  <p className="text-xs font-semibold text-headline">Step {index + 1}</p>
                  <h3 className="mt-2 text-base font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm text-foreground-secondary">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="difference" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">See the difference</h2>
              <p className="mt-3 text-foreground-secondary">
                Switch between an original and tailored example, then open the reasoning behind the research connection.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium",
                    compareMode === "original" ? "bg-accent text-white" : "border border-border bg-white text-foreground",
                  )}
                  onClick={() => setCompareMode("original")}
                >
                  Original
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-medium",
                    compareMode === "tailored" ? "bg-accent text-white" : "border border-border bg-white text-foreground",
                  )}
                  onClick={() => setCompareMode("tailored")}
                >
                  Tailored
                </button>
                <button
                  type="button"
                  className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-foreground"
                  onClick={() => setShowReasoning((v) => !v)}
                  aria-expanded={showReasoning}
                >
                  See the reasoning
                </button>
              </div>
              {showReasoning ? (
                <div className="mt-4 rounded-2xl border border-border bg-mint p-4 text-sm text-foreground">
                  <p className="font-semibold">Why this example connects</p>
                  <p className="mt-2 text-foreground-secondary">
                    Public team research mentions Python. The candidate’s Harbor Systems work includes Python APIs — so the tailored version brings that experience forward without inventing new claims.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="rounded-2xl border border-border bg-white p-5 shadow-[var(--shadow-sm)]">
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {compareMode === "tailored" ? "Tailored example" : "Original example"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                {compareMode === "tailored"
                  ? "Built Python APIs and PostgreSQL reporting workflows for internal operations teams — aligned to roles that use the same stack."
                  : "Built APIs and reporting workflows for internal operations teams across multiple services."}
              </p>
            </div>
          </div>
        </section>

        <section id="product" className="border-t border-border bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Built around one story</h2>
              <p className="mt-3 text-foreground-secondary">
                Candidate experience, a relevant team signal, and a tailored résumé — connected by the same arc you see in the product.
              </p>
            </div>
            <ArcStory />
          </div>
        </section>

        <section className="border-t border-border bg-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Bring your experience into focus.</h2>
              <p className="mt-2 text-foreground-secondary">{product.name} keeps research connected to what you can prove.</p>
            </div>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "lg" }), "rounded-full px-6")}>
              Get started
            </Link>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {demoOpen ? (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="demo-title"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close demo" onClick={() => setDemoOpen(false)} />
            <div ref={dialogRef} className="relative z-10 w-full max-w-3xl rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-md)] sm:p-6">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 id="demo-title" className="text-lg font-semibold">
                  Product demo
                </h2>
                <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={() => setDemoOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <DemoPlayer />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function DemoPlayer() {
  const [playing, setPlaying] = useState(false);
  const [hasMp4, setHasMp4] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/marketing/demo-product.mp4", { method: "HEAD" })
      .then((res) => {
        if (!cancelled) setHasMp4(res.ok);
      })
      .catch(() => {
        if (!cancelled) setHasMp4(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasMp4) {
    return (
      <div className="space-y-3">
        <video className="aspect-video w-full rounded-xl bg-forest object-cover" controls playsInline preload="none" poster="/marketing/demo-poster.svg">
          <source src="/marketing/demo-product.mp4" type="video/mp4" />
          <track kind="captions" src="/marketing/demo-captions.vtt" srcLang="en" label="English" default />
        </video>
        <p className="text-xs text-foreground-secondary">Edited/condensed footage — not a timing guarantee.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-xl bg-[var(--forest)] p-6 text-[var(--on-forest)]">
        <p className="text-sm font-medium text-[var(--fresh)]">Storyboard preview</p>
        <ol className="mt-4 space-y-2 text-sm">
          <li>0–8s · Upload or build profile</li>
          <li>8–18s · Jobs + team signal</li>
          <li>18–32s · Tailoring progress</li>
          <li>32–45s · Preview & download</li>
        </ol>
        <p className="mt-6 text-xs text-[var(--on-forest)]/80">MP4 not bundled yet. Capture: docs/marketing-video.md</p>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {playing ? "Pause storyboard" : "Play storyboard"}
      </Button>
    </div>
  );
}
