import { Card, CardContent } from "@/components/ui/card";

import { cn } from "@/lib/utils";



const STAGES = [
  { id: "understanding", label: "Researching the role" },
  { id: "tailoring", label: "Tailoring your résumé" },
  { id: "preparing", label: "Checking your résumé" },
] as const;



function formatElapsed(ms?: number) {

  if (!ms || ms < 1000) return "Just started";

  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) return `${seconds}s elapsed`;

  const minutes = Math.floor(seconds / 60);

  return `${minutes}m ${seconds % 60}s elapsed`;

}



export function CreatingState({
  children,
  pipelineStage = "understanding",
  pipelineLabel,
  elapsedMs,
  needsInput,
}: {
  children?: React.ReactNode;
  pipelineStage?: (typeof STAGES)[number]["id"];
  pipelineLabel?: string;
  elapsedMs?: number;
  needsInput?: boolean;
}) {

  const activeIndex = STAGES.findIndex((stage) => stage.id === pipelineStage);



  return (

    <div className="mx-auto max-w-3xl space-y-5">

      <Card>

        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-5 px-6 py-8 text-center">

          <div className="relative flex h-14 w-14 items-center justify-center" aria-hidden>
            <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none">
              <path d="M8 34C8 20 20 8 34 8" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="34" cy="10" r="3.5" fill="var(--lime)" className="motion-safe:animate-pulse" />
            </svg>
          </div>

          <div className="space-y-2">

            <h1 className="text-xl font-semibold">
              {needsInput ? "We need a few details" : (pipelineLabel ?? STAGES[activeIndex]?.label ?? "Working on your resume…")}
            </h1>
            <p className="text-sm text-foreground-secondary">
              {needsInput
                ? "Add a few missing profile details so we can finish your resume."
                : `${formatElapsed(elapsedMs)} · Still working — reload this page anytime to check progress.`}
            </p>

          </div>

          <ol className="grid w-full max-w-md gap-2 sm:grid-cols-3" aria-label="Resume progress">

            {STAGES.map((stage, index) => (

              <li

                key={stage.id}

                className={cn(

                  "rounded-lg border px-3 py-2 text-xs",

                  index < activeIndex

                    ? "border-success/30 bg-success/5 text-success"

                    : index === activeIndex

                      ? "border-accent/40 bg-accent/5 text-foreground"

                      : "border-border text-foreground-muted",

                )}

              >

                {stage.label}

              </li>

            ))}

          </ol>

        </CardContent>

      </Card>

      {children}

    </div>

  );

}

