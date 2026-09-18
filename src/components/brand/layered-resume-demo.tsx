"use client";

import { Check } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type LayeredResumeProps = {
  className?: string;
};

/**
 * Approved hero illustration: tall tilted résumé, mint halo, fresh-green focus badge,
 * and a separate floating dark insight strip (not inside the paper).
 */
export function LayeredResumeDemo({ className }: LayeredResumeProps) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("relative mx-auto w-full max-w-[340px] sm:max-w-[380px]", className)}>
      {/* Soft mint disc + outline behind the document */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-8 h-[78%] w-[92%] -translate-x-1/2 rounded-full bg-[var(--mint)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-4 h-[88%] w-[104%] -translate-x-1/2 rounded-full border border-[color-mix(in_oklab,var(--headline)_18%,transparent)]"
      />

      {/* Fresh-green focus badge — outside / overlapping the paper */}
      <div className="absolute left-2 top-2 z-20 inline-flex items-center gap-1.5 rounded-full bg-[var(--fresh)] px-3 py-1.5 text-xs font-semibold text-foreground shadow-[var(--shadow-sm)] sm:left-0 sm:top-0">
        <Check className="h-3.5 w-3.5" aria-hidden />
        Your experience, in focus
      </div>

      <article
        className={cn(
          "relative z-10 mt-8 origin-center rounded-xl border border-border bg-surface px-5 pb-6 pt-7 shadow-[var(--shadow-md)] sm:mt-10 sm:px-6",
          reduce ? "" : "rotate-[2.5deg] transition-transform duration-150 motion-safe:hover:rotate-[3.5deg]",
        )}
      >
        <header className="border-b border-border pb-3">
          <h3 className="text-[1.15rem] font-bold tracking-tight text-foreground">Jordan Lee</h3>
          <p className="mt-0.5 text-sm text-foreground-secondary">Software Engineer — Chicago, IL</p>
        </header>

        <section className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-secondary">
            Professional experience
          </p>
          <div className="mt-2">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-foreground">Harbor Systems</p>
              <p className="shrink-0 text-xs text-foreground-secondary">2022–2025</p>
            </div>
            <p className="mt-1 rounded-md bg-[var(--mint)] px-2 py-1.5 text-[13px] leading-snug text-foreground">
              Built Python APIs and PostgreSQL reporting workflows for internal operations teams.
            </p>
          </div>
        </section>

        <section className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-secondary">
            Relevant skills
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Python", "FastAPI", "PostgreSQL"].map((skill) => (
              <span
                key={skill}
                className="rounded-full border border-border bg-canvas px-2.5 py-0.5 text-xs font-medium text-foreground"
              >
                {skill}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground-secondary">
            Project experience
          </p>
          <p className="mt-2 text-[13px] leading-snug text-foreground-secondary">
            Internal reporting platform — APIs, data models, and operator workflows.
          </p>
        </section>
      </article>

      {/* Floating dark insight strip — separate from the paper */}
      <aside
        className={cn(
          "absolute -bottom-2 right-0 z-20 w-[min(100%,280px)] rounded-2xl bg-[var(--forest)] px-4 py-3 text-[var(--on-forest)] shadow-[var(--shadow-md)] sm:-bottom-4 sm:-right-3",
          reduce ? "" : "-rotate-[1.5deg]",
        )}
      >
        <p className="text-sm font-semibold leading-snug text-[var(--on-forest)]">
          The team uses Python. So have you.
        </p>
        <p className="mt-1 text-xs leading-snug text-[var(--on-forest)]/85">
          Research connects the dots in your experience.
        </p>
      </aside>
    </div>
  );
}
