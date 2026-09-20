import { Card, CardContent } from "@/components/ui/card";
import type { WritingReview } from "@/lib/resume-writing-review";

type Report = {
  name?: string;
  summary?: string;
  score?: number;
  roleAlignment?: number;
  atsReadability?: number;
  verifiedClaims?: number;
  researchSourcesUsed?: number;
  remainingSkillGaps?: string[];
  passed?: string[];
  missing?: string[];
  verifiedConclusions?: string[];
  aiEstimates?: string[];
  nextSteps?: string[];
  writingReview?: WritingReview;
};

export function QualityReport({ report, onReviewText }: { report?: Report; onReviewText?: (text: string) => void }) {
  if (!report) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <details className="group p-5">
          <summary className="cursor-pointer font-semibold">
            Résumé quality review
          </summary>
          <div className="mt-3 space-y-3 text-sm text-foreground-secondary">
            {report.summary ? <p>{report.summary}</p> : null}
            {report.writingReview ? (
              <div className="space-y-4">
                <p>Suggestions help you refine the wording. Keep your facts and use your judgment; every résumé does not need every competency.</p>
                {report.writingReview.criteria.map((criterion) => {
                  const findings = report.writingReview!.findings.filter((finding) => finding.criterion === criterion.id);
                  const status = { clear: "No wording flags", suggestion: "Review suggested", signal_found: "Possible examples found", not_observed: "Optional to add", not_evaluated: "Not evaluated" }[criterion.status];
                  return (
                    <details key={criterion.id} className="rounded-lg border border-border p-3">
                      <summary className="cursor-pointer text-foreground"><span className="font-medium">{criterion.label}</span> · {status}</summary>
                      <p className="mt-2">{criterion.detail}</p>
                      {findings.length > 0 && <ul className="mt-3 space-y-3">
                        {findings.map((finding, index) => <li key={`${finding.sectionId}-${finding.bulletIndex}-${index}`}>
                          <p className="font-medium text-foreground">{finding.section}{finding.item ? ` · ${finding.item}` : ""}{finding.bulletIndex !== undefined ? ` · Bullet ${finding.bulletIndex + 1}` : ""}</p>
                          <blockquote className="my-1 border-l-2 border-border pl-3">{finding.text}</blockquote>
                          <p>{finding.message}</p>
                          {onReviewText && <button type="button" className="mt-2 font-medium text-accent underline focus-visible:outline focus-visible:outline-2" onClick={() => onReviewText(finding.text)}>Review this text</button>}
                        </li>)}
                      </ul>}
                    </details>
                  );
                })}
              </div>
            ) : null}
            {!report.writingReview && report.passed?.length ? (
              <div>
                <p className="font-medium text-foreground">What passed</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.passed.slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {!report.writingReview && report.missing?.length ? (
              <div>
                <p className="font-medium text-foreground">What remains missing</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.missing.slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.verifiedConclusions?.length ? (
              <div>
                <p className="font-medium text-foreground">Measured and recorded checks</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.verifiedConclusions.slice(0, 6).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.aiEstimates?.length ? (
              <div>
                <p className="font-medium text-foreground">AI estimate</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.aiEstimates.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                {typeof report.roleAlignment === "number" ? (
                  <p>Role alignment (AI estimate): {report.roleAlignment}/100</p>
                ) : null}
                {typeof report.atsReadability === "number" ? (
                  <p>ATS readability (AI estimate): {report.atsReadability}/100</p>
                ) : null}
              </>
            )}
            {!report.writingReview && report.nextSteps?.length ? (
              <div>
                <p className="font-medium text-foreground">What you can do next</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.nextSteps.slice(0, 5).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {typeof report.verifiedClaims === "number" ? <p>Bullets with evidence links: {report.verifiedClaims}</p> : null}
            {typeof report.researchSourcesUsed === "number" ? (
              <p>Research sources used: {report.researchSourcesUsed}</p>
            ) : null}
            {report.remainingSkillGaps?.length ? (
              <p>Important remaining skill gaps: {report.remainingSkillGaps.join(", ")}</p>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
