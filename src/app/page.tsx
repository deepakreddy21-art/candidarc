"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Menu, Pause, Play, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ArcStory } from "@/components/brand/arc-story";
import { LayeredResumeDemo } from "@/components/brand/layered-resume-demo";
import { Button, buttonVariants } from "@/components/ui/button";
import { product } from "@/config/product";
import { cn } from "@/lib/utils";

const nav = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#product", label: "Product" },
  { href: "#demo", label: "Demo" },
];

const workflow = [
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
];

export default function LandingPage() {
  const reduceMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
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
    <div className="min-h-dvh bg-canvas text-foreground">
      <div className="pointer-events-none fixed inset-0 arc-bg opacity-90" aria-hidden />
      <header className="sticky top-0 z-40 border-b border-border/80 bg-canvas/90 backdrop-blur-md">
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
            <Link href="/sign-in" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}>
              Sign in
            </Link>
            <Link href="/sign-up" className={cn(buttonVariants({ size: "sm" }), "hidden sm:inline-flex")}>
              Create my account
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
                {nav.map((item) => (
                  <a key={item.href} href={item.href} className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                    {item.label}
                  </a>
                ))}
                <Link href="/sign-in" className="rounded-[10px] px-3 py-2.5 text-sm hover:bg-surface-2">
                  Sign in
                </Link>
                <Link href="/sign-up" className={cn(buttonVariants(), "mt-2")}>
                  Create my account
                </Link>
              </nav>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main>
        <section className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pt-16">
          <div>
            <p className="text-sm font-medium tracking-wide text-accent">Research-backed résumé intelligence.</p>
            <h1 className="mt-4 font-serif text-[clamp(2.1rem,5.5vw,3.75rem)] leading-[1.08] tracking-tight text-balance text-foreground">
              Your experience. Their team. A résumé that connects them.
            </h1>
            <p className="mt-5 max-w-xl text-base text-foreground-secondary sm:text-lg">
              Discover relevant roles, understand the team behind them, and tailor a résumé around the experience you already have.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
                Create my account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#how-it-works" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                See how it works
              </a>
            </div>
            <p className="mt-4 text-sm text-foreground-secondary">
              Have a résumé? Upload it. Starting fresh? We’ll help you build one.
            </p>
          </div>
          <LayeredResumeDemo />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="panel-forest overflow-hidden rounded-2xl px-6 py-10 sm:px-10 sm:py-12">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
              <div>
                <p className="text-sm font-medium text-[var(--lime)]">Illustrative example</p>
                <h2 className="mt-3 font-serif text-[clamp(1.75rem,4vw,2.75rem)] leading-tight text-[var(--on-forest)]">
                  The team uses Python. So have you.
                </h2>
                <p className="mt-4 max-w-xl text-base text-[var(--on-forest)]/90">
                  CandidArc connects company and team research with relevant experience from your profile.
                </p>
              </div>
              <div className="rounded-xl border border-white/15 bg-black/15 p-4 backdrop-blur-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--lime)]">Sourced context</p>
                <p className="mt-2 text-sm text-[var(--on-forest)]">
                  Public team signal · engineering · example stack mention (Python)
                </p>
                <p className="mt-3 text-sm text-[var(--on-forest)]/85">
                  Matched to your Harbor Systems platform work — shown only when research and your profile both support it.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <h2 className="font-serif text-3xl tracking-tight text-foreground">How it works</h2>
          <p className="mt-2 max-w-2xl text-foreground-secondary">A short path from profile to a résumé you can defend.</p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {workflow.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
                <p className="text-xs font-semibold text-accent">Step {index + 1}</p>
                <h3 className="mt-2 text-base font-semibold text-foreground">{step.title}</h3>
                <p className="mt-2 text-sm text-foreground-secondary">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="product" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <h2 className="font-serif text-3xl tracking-tight">Built around one story</h2>
              <p className="mt-3 text-foreground-secondary">
                Candidate experience, a relevant team signal, and a tailored résumé — connected by the same arc you see in the product.
              </p>
            </div>
            <ArcStory />
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-sm)] sm:p-8">
            <h2 className="font-serif text-3xl tracking-tight">See CandidArc in motion</h2>
            <p className="mt-2 max-w-2xl text-foreground-secondary">
              Watch a condensed walkthrough of upload → Jobs → team signal → tailored résumé. Footage is edited for length; real waits may differ.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" onClick={() => setDemoOpen(true)}>
                <Play className="h-4 w-4" />
                Watch product demo
              </Button>
              <a href="#how-it-works" className={buttonVariants({ variant: "secondary" })}>
                Skip to steps
              </a>
            </div>
            <p className="mt-3 text-xs text-foreground-secondary">
              Demo video assets: see <code className="rounded bg-mint px-1">docs/marketing-video.md</code> for capture/export. Playback loads media only when you open the player.
            </p>
          </div>
        </section>

        <section className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h2 className="font-serif text-3xl tracking-tight">Bring your experience into focus.</h2>
              <p className="mt-2 text-foreground-secondary">{product.name} keeps research connected to what you can prove.</p>
            </div>
            <Link href="/sign-up" className={buttonVariants({ size: "lg" })}>
              Create my account
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

/** Lazy demo player — uses poster + optional MP4 when present; otherwise storyboard frames. */
function DemoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
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
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-xl bg-forest object-cover"
          controls
          playsInline
          preload="none"
          poster="/marketing/demo-poster.svg"
        >
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
        <p className="text-sm font-medium text-[var(--lime)]">Storyboard preview</p>
        <ol className="mt-4 space-y-2 text-sm">
          <li>0–8s · Upload or build profile</li>
          <li>8–18s · Jobs + team signal</li>
          <li>18–32s · Tailoring progress</li>
          <li>32–45s · Preview & download</li>
        </ol>
        <p className="mt-6 text-xs text-[var(--on-forest)]/80">
          MP4 not bundled yet. Capture instructions: docs/marketing-video.md
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setPlaying((p) => !p)}
          aria-pressed={playing}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause storyboard" : "Play storyboard"}
        </Button>
      </div>
    </div>
  );
}
