import { Card, CardContent } from "@/components/ui/card";

import { cn } from "@/lib/utils";



const STAGES = [

  { id: "understanding", label: "Understanding role" },

  { id: "tailoring", label: "Tailoring experience" },

  { id: "preparing", label: "Preparing documents" },

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

          <div className="relative h-12 w-12" aria-hidden>

            <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />

            <span className="absolute inset-2 rounded-full border-2 border-accent border-r-transparent motion-safe:animate-spin" />

          </div>

          <div className="space-y-2">

            <h1 className="text-xl font-semibold">
              {needsInput ? "We need a few details" : (pipelineLabel ?? STAGES[activeIndex]?.label ?? "Working on your resume…")}
            </h1>
            <p className="text-sm text-foreground-secondary">
              {needsInput
                ? "Answer the technology questions below so we can tailor your resume accurately."
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

