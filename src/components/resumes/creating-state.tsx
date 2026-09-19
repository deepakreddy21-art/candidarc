import { Check } from "lucide-react";
import { ResumeMotionScene } from "@/components/brand/resume-motion-scene";

const STAGES = [
  { key: "understanding", label: "Understanding the role", caption: "The right details come together." },
  { key: "tailoring", label: "Tailoring your résumé", caption: "Your strongest experience moves forward." },
  { key: "preparing", label: "Checking your résumé", caption: "A final check before your review." },
] as const;

type CreatingStateProps = {
  children?: React.ReactNode;
  pipelineStage?: "understanding" | "tailoring" | "preparing";
  pipelineLabel?: string; elapsedMs?: number; needsInput?: boolean;
};

export function CreatingState({ children, pipelineStage = "understanding", pipelineLabel, elapsedMs = 0, needsInput }: CreatingStateProps) {
  const index = Math.max(0, STAGES.findIndex((item) => item.key === pipelineStage));
  const elapsed = elapsedMs < 1000 ? "Just started" : elapsedMs < 60_000 ? `${Math.floor(elapsedMs / 1000)}s elapsed` : `${Math.floor(elapsedMs / 60_000)}m elapsed`;
  return <div className="focus-creating">
    <header><p className="focus-eyebrow">BUILT AROUND YOU</p><h1>{needsInput ? "We need a few details" : "Watch your experience come into focus."}</h1><p>{needsInput ? "Add what’s missing so we can continue." : "Three quiet moments. One résumé built around you."}</p></header>
    <ol className="focus-pipeline" aria-label="Résumé preparation progress">{STAGES.map((item, i) => <li key={item.key} data-state={i < index ? "complete" : i === index ? "active" : "pending"} aria-current={i === index ? "step" : undefined}><span>{i < index ? <Check size={18} aria-hidden /> : `0${i + 1}`}</span><p>{item.label}</p></li>)}</ol>
    <ResumeMotionScene stage={pipelineStage} />
    <div className="focus-creating-status" role="status"><h2>{needsInput ? "Waiting for your details" : STAGES[index].caption}</h2><p>{pipelineLabel && pipelineLabel !== STAGES[index].label ? `${pipelineLabel} · ` : ""}{elapsed}</p></div>
    <p className="text-center text-sm text-foreground-secondary">Your job details are saved. You can leave this page and return to check progress.</p>
    {children}
  </div>;
}
