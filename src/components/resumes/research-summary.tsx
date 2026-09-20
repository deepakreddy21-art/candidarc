import Link from "next/link";
import type { ResumeResearch } from "@/types/resume-research";

const scopeLabels: Record<string, string> = {
  team: "Team context", product: "Product context", company: "Company context", role: "Role requirements", unknown: "Context to review",
};

export function ResearchSummary({ research }: { research?: ResumeResearch }) {
  if (!research) return null;
  const priorities = research.plan.filter((item) => item.placement !== "interview_only");
  const questions = research.plan.filter((item) => item.placement === "interview_only");
  return <details className="rounded-xl border border-border bg-surface p-4 text-left" data-testid="resume-research">
    <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Research and résumé approach</summary>
    <div className="mt-4 space-y-4 text-sm">
      <p>{research.notice}</p>
      {priorities.length > 0 && <section aria-label="Résumé priorities">
        <h3 className="font-semibold">Relevant experience from your profile</h3>
        <ul className="mt-2 space-y-2">{priorities.map((item, i) => <li key={i}><span className="font-medium">{item.capability}: </span>{item.emphasis}</li>)}</ul>
      </section>}
      {research.findings.length > 0 && <section aria-label="Research sources">
        <h3 className="font-semibold">What the sources say</h3>
        <ul className="mt-2 space-y-3">{research.findings.map((finding, i) => <li key={i}>
          <p className="font-medium">{finding.title}</p>
          <p className="text-xs text-foreground-secondary">{scopeLabels[finding.scope] ?? scopeLabels.unknown} · {finding.status === "verified" ? "Source-supported" : finding.status === "disputed" ? "Conflicting information" : "Not confirmed"}</p>
          <p className="mt-1">{finding.summary}</p>
          {finding.caveat && <p className="mt-1 text-foreground-secondary">{finding.caveat}</p>}
          {finding.sources.map((source) => <p key={source.url} className="mt-1 break-words">
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{source.title}</a>
            <span className="text-xs text-foreground-secondary"> · {source.publishedAt ? `Published ${source.publishedAt.slice(0, 10)}` : "Publication date unknown"} · Retrieved {source.accessedAt.slice(0, 10)}</span>
          </p>)}
        </li>)}</ul>
      </section>}
      {research.limitations.length > 0 && <ul className="space-y-1 text-foreground-secondary">{research.limitations.map((text, i) => <li key={i}>{text}</li>)}</ul>}
      {questions.length > 0 && <section aria-label="Optional experience to add">
        <h3 className="font-semibold">Anything else you’ve worked on?</h3>
        <p className="mt-1">These areas weren’t supported by your saved profile. They’re kept out of résumé claims.</p>
        <ul className="mt-2 space-y-1">{questions.map((item, i) => <li key={i}>{item.gap || item.capability}</li>)}</ul>
        <Link href="/app/profile" className="mt-2 inline-block font-medium underline underline-offset-2">Add relevant experience to your profile</Link>
      </section>}
    </div>
  </details>;
}
