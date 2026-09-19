import Image from "next/image";
import { Check } from "lucide-react";

export type ResumeSceneStage = "understanding" | "tailoring" | "preparing" | "ready";

export const RESUME_MOMENTS = [
  { stage: "understanding", title: "Understanding the role", caption: "The right details come together." },
  { stage: "tailoring", title: "Tailoring your résumé", caption: "Your strongest experience moves forward." },
  { stage: "ready", title: "Ready for your review", caption: "Review. Download. Make your next move." },
] as const;

/** Follows a supplied state; never schedules or invents pipeline progress. */
export function ResumeMotionScene({ stage, sample = false }: { stage: ResumeSceneStage; sample?: boolean }) {
  return (
    <div className="resume-motion-scene" data-stage={stage} aria-hidden="true">
      <Image src="/brand/resume-studio.webp" alt="" fill sizes="(max-width: 767px) 100vw, 720px" className="object-cover" />
      {stage === "understanding" ? (
        <div className="research-papers" key={stage}>
          <div className="scene-paper research-paper"><h3>Your experience</h3><span className="paper-rule" /><p>{sample ? "Software Engineer" : "Your career profile"}</p><p>{sample ? "Build and ship web applications" : "Experience and achievements"}</p><p className="paper-highlight">{sample ? "Python" : "Your skills"}</p><p>{sample ? "APIs and integrations" : "Projects and education"}</p><p>{sample ? "Problem solving" : "Your strongest work"}</p><p>{sample ? "Team collaboration" : "Details you’ve reviewed"}</p></div>
          <div className="scene-paper research-paper"><h3>Role research</h3><span className="paper-rule" /><p>{sample ? "Backend Engineer" : "The role you chose"}</p><p>{sample ? "Build scalable systems" : "Job requirements"}</p><p className="paper-highlight">{sample ? "Python APIs" : "Relevant connections"}</p><p>{sample ? "RESTful services" : "Team signals"}</p><p>{sample ? "System design" : "Company context"}</p><p>{sample ? "Technical collaboration" : "Research sources"}</p></div>
        </div>
      ) : (
        <div className="assembly-papers" key={stage}>
          <div className="scene-paper assembled-paper">
            <h3>{sample ? "Jordan Lee" : "Your résumé"}</h3>
            <p className="paper-subtitle">{sample ? "Software Engineer · Chicago, IL" : "Built around your experience"}</p>
            <span className="paper-rule" />
            {["Experience", "Projects", "Skills"].map((title) => <section key={title}><h4>{title}</h4><span className="paper-line paper-highlight" /><span className="paper-line" /><span className="paper-line short" /></section>)}
            {stage === "ready" && <span className="paper-ready-check"><Check /></span>}
          </div>
          {stage === "tailoring" && <div className="assembly-strips">{[
            ["Experience", "Real impact from your work"], ["Projects", "Showcase what you’ve built"], ["Skills", "Relevant tools and technologies"],
          ].map(([title, text]) => <div className="scene-paper assembly-strip" key={title}><strong>{title}</strong><small>{text}</small><span className="strip-highlight" /></div>)}</div>}
          {stage === "preparing" && <div className="quality-scan" />}
        </div>
      )}
    </div>
  );
}
