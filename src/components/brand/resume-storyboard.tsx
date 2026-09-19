"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { RESUME_MOMENTS, ResumeMotionScene } from "./resume-motion-scene";

/** Labelled marketing demo. Live progress uses the same art with server state. */
export function ResumeStoryboard() {
  const [moment, setMoment] = useState(0);
  const [playing, setPlaying] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!playing || reduce) return;
    if (moment === RESUME_MOMENTS.length - 1) return;
    const timer = window.setTimeout(() => {
      setMoment(moment + 1);
      if (moment + 1 === RESUME_MOMENTS.length - 1) setPlaying(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [playing, reduce, moment]);
  const current = RESUME_MOMENTS[moment];
  return <div className="focus-storyboard">
    <h3>Watch your experience come into focus.</h3>
    <p>Three quiet moments. One résumé built around you.</p>
    <div className="storyboard-tabs" role="group" aria-label="Preview each moment">
      {RESUME_MOMENTS.map((item, index) => <button key={item.stage} type="button" aria-pressed={moment === index} onClick={() => { setPlaying(false); setMoment(index); }}><span>0{index + 1}</span>{item.title}</button>)}
    </div>
    <ResumeMotionScene stage={current.stage} sample />
    <p className="storyboard-caption" aria-live="polite">{current.caption}</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-foreground-secondary">Illustrative sample data. Actual progress follows your résumé’s processing stages.</p>
      {!reduce && <Button type="button" variant="secondary" size="sm" aria-pressed={playing} onClick={() => { if (!playing && moment === 2) setMoment(0); setPlaying(!playing); }}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? "Pause storyboard" : "Play storyboard"}</Button>}
    </div>
  </div>;
}
