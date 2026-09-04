"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/feedback";
import { radarApi } from "@/services/radar-api";
import type { SourceCoverageSummary } from "@/types/radar";
import { formatDate } from "@/lib/utils";

export default function RadarSourcesPage() {
  const [coverage, setCoverage] = useState<SourceCoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await radarApi.getSourceCoverage();
        if (!cancelled) setCoverage(data);
      } catch {
        toast.error("Could not load source coverage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Source coverage"
        description="Broad source coverage across company careers, public ATS boards, and licensed providers when credentials exist — not every job on the internet."
        actions={
          <Link href="/app/radar" className={buttonVariants({ variant: "secondary" })}>
            Back to Radar
          </Link>
        }
      />

      {loading || !coverage ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>How coverage works</CardTitle>
              <CardDescription>Honest language for discovery scope</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-foreground-secondary">
              <p>{coverage.summary}</p>
              <p>
                LinkedIn and Indeed adapters remain <span className="font-medium text-foreground">disabled</span>{" "}
                until valid partnership or licensed credentials exist. Any LinkedIn-shaped listings in Radar are
                demo fixtures and are labeled as such.
              </p>
              <p>
                CandidArc does not claim complete LinkedIn access, guaranteed real-time coverage, or guaranteed
                posting timestamps for every source.
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            {coverage.items.map((item) => (
              <Card key={item.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-foreground-muted">{item.category}</p>
                    </div>
                    <Badge tone={item.enabled ? "success" : "neutral"}>{item.statusLabel}</Badge>
                  </div>
                  <p className="text-sm text-foreground-secondary">{item.honestNote}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-foreground-muted">
                    <span>License: {item.licenseStatus.replace(/_/g, " ")}</span>
                    {item.rpmLimit ? <span>RPM limit: {item.rpmLimit}</span> : null}
                    {item.lastComplianceReview ? (
                      <span>Reviewed {formatDate(item.lastComplianceReview)}</span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
