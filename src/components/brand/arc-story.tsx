"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type ArcStoryProps = {
  className?: string;
  /** When true, play once then settle; show Replay unless reduced motion. */
  autoPlay?: boolean;
  compact?: boolean;
};

const LABELS = ["Your experience", "Team signal", "Tailored résumé"] as const;

/**
 * Signature story: candidate experience → company/team signal → tailored résumé.
 * Decorative only — pointer-events none on the SVG layer.
 */
export function ArcStory({ className, autoPlay = true, compact = false }: ArcStoryProps) {
  const reduceMotion = useReducedMotion();
  const pathId = useId();
  const [phase, setPhase] = useState<"idle" | "playing" | "settled">("idle");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!autoPlay || reduceMotion) {
      setPhase("settled");
      return;
    }
    setPhase("playing");
    const t = window.setTimeout(() => setPhase("settled"), 2400);
    return () => window.clearTimeout(t);
  }, [autoPlay, reduceMotion]);

  function replay() {
    if (reduceMotion) return;
    setPaused(false);
    setPhase("playing");
    window.setTimeout(() => setPhase("settled"), 2400);
  }

  const animateMarker = phase === "playing" && !paused && !reduceMotion;

  return (
    <div className={cn("relative", className)}>
      <div className={cn("rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-md)] sm:p-5", compact && "p-3")}>
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">How CandidArc connects</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {LABELS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "rounded-xl border border-border px-3 py-2.5 text-sm",
                i === 1 ? "border-transparent bg-[var(--forest)] text-[var(--on-forest)]" : "bg-canvas text-foreground",
              )}
            >
              <p className={cn("font-medium", i === 1 ? "text-[var(--on-forest)]" : "text-foreground")}>{label}</p>
              {i === 1 ? (
                <p className="mt-1 text-xs text-[var(--on-forest)]/90">The team uses Python. So have you.</p>
              ) : i === 0 ? (
                <p className="mt-1 text-xs text-foreground-secondary">Roles & outcomes you already have</p>
              ) : (
                <p className="mt-1 text-xs text-foreground-secondary">A clean page you can defend</p>
              )}
            </div>
          ))}
        </div>

        <svg
          className="pointer-events-none mt-4 h-16 w-full overflow-visible"
          viewBox="0 0 320 64"
          fill="none"
          aria-hidden
        >
          <path
            id={pathId}
            d="M24 48 C 80 8, 240 8, 296 48"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.85"
          />
          <path d="M24 48 C 80 8, 240 8, 296 48" stroke="var(--lime)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
          <circle cx="24" cy="48" r="4" fill="var(--lime)" />
          <circle cx="160" cy="16" r="4" fill="var(--accent)" />
          <circle cx="296" cy="48" r="4" fill="var(--lime)" />
          {animateMarker ? (
            <motion.circle
              r="5"
              fill="var(--accent)"
              initial={{ offsetDistance: "0%" }}
              animate={{ offsetDistance: "100%" }}
              transition={{ duration: 2.2, ease: "easeInOut" }}
              style={{ offsetPath: `path('M24 48 C 80 8, 240 8, 296 48')` }}
            />
          ) : (
            <circle cx="296" cy="48" r="5" fill="var(--accent)" />
          )}
        </svg>
      </div>

      {!reduceMotion ? (
        <div className="mt-2 flex items-center gap-2">
          {phase === "playing" ? (
            <button
              type="button"
              className="text-xs font-medium text-accent hover:text-accent-hover"
              onClick={() => setPaused((p) => !p)}
            >
              {paused ? "Resume" : "Pause"}
            </button>
          ) : null}
          {phase === "settled" ? (
            <button type="button" className="text-xs font-medium text-accent hover:text-accent-hover" onClick={replay}>
              Replay
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
