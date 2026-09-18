"use client";

import { useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type LayeredResumeProps = {
  className?: string;
};

/** Marketing-only layered résumé depth. Never wraps the real editor. */
export function LayeredResumeDemo({ className }: LayeredResumeProps) {
  const reduce = useReducedMotion();
  const tilt = reduce
    ? ""
    : "transition-transform duration-[150ms] will-change-transform hover:[transform:perspective(900px)_rotateY(-2.5deg)_rotateX(1.5deg)]";

  return (
    <div className={cn("relative mx-auto w-full max-w-md", className)}>
      <div
        aria-hidden
        className="absolute -left-3 top-6 h-[88%] w-full rounded-xl border border-border bg-mint/80 shadow-[var(--shadow-sm)]"
        style={reduce ? undefined : { transform: "rotate(-2deg)" }}
      />
      <div
        aria-hidden
        className="absolute -right-2 top-3 h-[92%] w-full rounded-xl border border-border bg-surface shadow-[var(--shadow-sm)]"
        style={reduce ? undefined : { transform: "rotate(1.5deg)" }}
      />
      <article
        className={cn(
          "relative rounded-xl border border-border-strong bg-surface p-5 shadow-[var(--shadow-md)] sm:p-6",
          tilt,
        )}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-secondary">Sample résumé</p>
        <h3 className="mt-2 text-lg font-semibold text-foreground">Jordan Blake</h3>
        <p className="text-sm text-foreground-secondary">Platform Engineer · Seattle, WA</p>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="font-medium text-foreground">Harbor Systems</p>
            <p className="text-foreground-secondary">Built Kubernetes-based deployment pipelines for 12 services</p>
          </div>
          <div className="rounded-lg bg-[var(--forest)] px-3 py-2 text-[var(--on-forest)]">
            <p className="text-xs font-medium text-[var(--lime)]">Team signal</p>
            <p className="text-sm font-medium">The team uses Python. So have you.</p>
          </div>
          <div>
            <p className="font-medium text-foreground">Observability Fabric</p>
            <p className="text-foreground-secondary">OpenTelemetry collectors for platform reliability</p>
          </div>
        </div>
      </article>
    </div>
  );
}
