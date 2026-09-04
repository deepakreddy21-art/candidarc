"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { workflowSteps } from "@/data/seed";
import type { WorkflowStage } from "@/types/domain";

const stageOrder: WorkflowStage[] = [
  "research",
  "evidence-match",
  "resume-v0",
  "hr-audit-1",
  "resume-v1",
  "em-audit-1",
  "resume-v2",
  "hr-audit-2",
  "resume-v3",
  "em-audit-2",
  "resume-v4",
  "final-qa",
  "ready",
];

export function WorkflowJourney({
  currentStage = "final-qa",
  compact = false,
  className,
}: {
  currentStage?: WorkflowStage;
  compact?: boolean;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const currentIdx = Math.max(0, stageOrder.indexOf(currentStage));

  return (
    <div className={cn("relative", className)}>
      <div className={cn("grid gap-2", compact ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
        {workflowSteps.map((step, i) => {
          const stepIdx = stageOrder.indexOf(step.stage);
          const done = stepIdx >= 0 && stepIdx < currentIdx;
          const active = step.stage === currentStage || (currentStage === "ready" && step.stage === "final-qa");
          return (
            <motion.div
              key={step.id}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: reduce ? 0 : i * 0.03 }}
              className={cn(
                "relative flex items-start gap-3 rounded-xl border px-3.5 py-3",
                done && "border-[color-mix(in_oklab,var(--success)_28%,transparent)] bg-[color-mix(in_oklab,var(--success)_6%,transparent)]",
                active && "border-[color-mix(in_oklab,var(--accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]",
                !done && !active && "border-border bg-surface",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  done && "bg-success text-white",
                  active && "bg-accent text-white",
                  !done && !active && "bg-surface-2 text-foreground-muted",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{step.label}</p>
                <p className="mt-0.5 text-[11px] text-foreground-muted">
                  {done ? "Complete" : active ? "Current" : "Upcoming"}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export const landingWorkflowSteps = [
  "Understand the role",
  "Match verified evidence",
  "Generate the first resume",
  "Run HR Audit 1",
  "Regenerate",
  "Run EM Audit 1",
  "Regenerate",
  "Run HR Audit 2",
  "Regenerate",
  "Run EM Audit 2",
  "Produce the final version",
  "Prepare for interviews",
] as const;

export function LandingWorkflowJourney({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <ol className={cn("relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4", className)}>
      <div className="pointer-events-none absolute left-4 right-4 top-5 hidden h-px arc-line opacity-60 xl:block" aria-hidden />
      {landingWorkflowSteps.map((label, i) => (
        <motion.li
          key={label + i}
          initial={reduce ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: reduce ? 0 : i * 0.04 }}
          className="relative flex items-start gap-3 rounded-xl border border-border bg-surface/80 px-4 py-3.5 backdrop-blur-sm"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-canvas font-mono text-[11px] font-semibold text-foreground-secondary">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="pt-0.5 text-sm font-medium leading-snug text-foreground">{label}</span>
        </motion.li>
      ))}
    </ol>
  );
}
