import Image from "next/image";
import { Check } from "lucide-react";
import { ArcMark } from "./logo";
import { cn } from "@/lib/utils";

/** Approved illustration is sample data; all overlays remain accessible HTML. */
export function LayeredResumeDemo({ className }: { className?: string }) {
  return (
    <figure className={cn("focus-hero-art", className)} aria-label="Sample résumé preview for Jordan Lee">
      <Image src="/brand/hero-resume.webp" width={1254} height={1254} priority
        sizes="(max-width: 767px) 100vw, 58vw" className="focus-hero-paper"
        alt="Illustrative résumé for Jordan Lee, Software Engineer at Harbor Systems, with Python, FastAPI and PostgreSQL experience. A green ribbon connects the experience to the role." />
      <span className="focus-hero-badge"><Check size={16} aria-hidden />Your experience, in focus.</span>
      <span className="focus-sample-note">Sample<br />preview <span aria-hidden>↙</span></span>
      <figcaption className="focus-hero-insight">
        <ArcMark inverse className="focus-insight-mark" />
        <div>
          <p className="focus-insight-title">The team uses Python. So have you.</p>
          <p className="focus-insight-copy">Research connects the dots in your experience.</p>
        </div>
      </figcaption>
    </figure>
  );
}
