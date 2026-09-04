"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/feedback";
import { SectionHeader } from "@/components/layout/page-header";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AppInsights } from "@/types/domain";

const ScoreTrendChart = dynamic(
  () => import("./insights-charts").then((m) => m.ScoreTrendChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full" />,
  },
);

const ReadinessChart = dynamic(
  () => import("./insights-charts").then((m) => m.ReadinessChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full" />,
  },
);

const CoverageChart = dynamic(
  () => import("./insights-charts").then((m) => m.CoverageChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-48 w-full" />,
  },
);

export function InsightsPanel({
  className,
  compact = true,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [data, setData] = useState<AppInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const insights = await api.getInsights();
        if (!cancelled) setData(insights);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !data) {
    return (
      <div className={cn("space-y-4", className)}>
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-52" />
          <Skeleton className="h-52" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-5", className)}>
      {!compact ? (
        <SectionHeader
          title="Insights"
          description="Score progression, coverage gaps, and interview readiness."
        />
      ) : (
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Insights</h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            Cisco score path 68 → 91 with remaining competency gaps.
          </p>
        </div>
      )}

      <div className={cn("grid gap-4", compact ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Score by version</CardTitle>
            <CardDescription>V0 through final V4</CardDescription>
          </CardHeader>
          <CardContent>
            <ScoreTrendChart data={data.scoreByVersion} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Interview readiness</CardTitle>
            <CardDescription>Weekly practice trend</CardDescription>
          </CardHeader>
          <CardContent>
            <ReadinessChart data={data.interviewReadinessTrend} />
          </CardContent>
        </Card>

        {!compact ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Evidence by role</CardTitle>
              <CardDescription>Coverage across applications</CardDescription>
            </CardHeader>
            <CardContent>
              <CoverageChart data={data.evidenceByRole} />
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Missing competencies</CardTitle>
            <CardDescription>Gaps still showing up in audits and interviews</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="pb-2 font-medium">Competency</th>
                  <th className="pb-2 font-medium">Mentions</th>
                </tr>
              </thead>
              <tbody>
                {data.missingCompetencies.map((row) => (
                  <tr key={row.name} className="border-t border-border">
                    <td className="py-2.5 font-medium">{row.name}</td>
                    <td className="py-2.5">
                      <Badge tone="warning">{row.count}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Repeated audit issues</CardTitle>
            <CardDescription>Patterns mistake memory should keep blocking</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-foreground-muted">
                <tr>
                  <th className="pb-2 font-medium">Issue</th>
                  <th className="pb-2 font-medium">Count</th>
                </tr>
              </thead>
              <tbody>
                {data.repeatedAuditIssues.map((row) => (
                  <tr key={row.issue} className="border-t border-border">
                    <td className="py-2.5 font-medium">{row.issue}</td>
                    <td className="py-2.5 tabular-nums text-foreground-secondary">{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.storiesNeedingMetrics.length ? (
              <div className="mt-4 space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
                  Stories needing metrics
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs text-foreground-secondary">
                  {data.storiesNeedingMetrics.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
