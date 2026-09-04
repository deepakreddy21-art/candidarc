import { Card, CardContent } from "@/components/ui/card";

type Report = {
  summary?: string;
  score?: number;
  roleAlignment?: number;
  atsReadability?: number;
  verifiedClaims?: number;
  researchSourcesUsed?: number;
  remainingSkillGaps?: string[];
};

export function QualityReport({ report }: { report?: Report }) {
  if (!report) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <details className="group p-5">
          <summary className="cursor-pointer font-semibold">Quality report</summary>
          <div className="mt-3 space-y-2 text-sm text-foreground-secondary">
            {report.summary ? <p>{report.summary}</p> : null}
            {typeof report.roleAlignment === "number" ? <p>Role alignment: {report.roleAlignment}/100</p> : null}
            {typeof report.atsReadability === "number" ? <p>ATS readability: {report.atsReadability}/100</p> : null}
            {typeof report.verifiedClaims === "number" ? <p>Verified claims: {report.verifiedClaims}</p> : null}
            {typeof report.researchSourcesUsed === "number" ? <p>Research sources used: {report.researchSourcesUsed}</p> : null}
            {report.remainingSkillGaps?.length ? (
              <p>Important remaining skill gaps: {report.remainingSkillGaps.join(", ")}</p>
            ) : null}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
