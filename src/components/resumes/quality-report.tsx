import { Card, CardContent } from "@/components/ui/card";

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
};

export function QualityReport({ report }: { report?: Report }) {
  if (!report) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <details className="group p-5">
          <summary className="cursor-pointer font-semibold">
            {report.name ?? "CandidArc Quality Score"}
            {typeof report.score === "number" ? ` · ${report.score}/100` : ""}
          </summary>
          <div className="mt-3 space-y-3 text-sm text-foreground-secondary">
            {report.summary ? <p>{report.summary}</p> : null}
            {report.passed?.length ? (
              <div>
                <p className="font-medium text-foreground">What passed</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.passed.slice(0, 8).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.missing?.length ? (
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
                <p className="font-medium text-foreground">Verified</p>
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
            {report.nextSteps?.length ? (
              <div>
                <p className="font-medium text-foreground">What you can do next</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.nextSteps.slice(0, 5).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {typeof report.verifiedClaims === "number" ? <p>Verified claims: {report.verifiedClaims}</p> : null}
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
