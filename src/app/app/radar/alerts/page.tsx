"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { AlertForm } from "@/components/radar/alert-form";
import { radarApi } from "@/services/radar-api";
import type { JobAlert } from "@/types/radar";
import { formatRelative } from "@/lib/utils";

const cadenceLabel: Record<JobAlert["cadence"], string> = {
  immediate: "Immediate",
  near_realtime: "Near real time",
  every_15m: "Every 15 minutes",
  hourly: "Hourly",
  every_3h: "Every 3 hours",
  daily: "Daily",
  weekly: "Weekly",
  paused: "Paused",
};

export default function RadarAlertsPage() {
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);
    try {
      setAlerts(await radarApi.listAlerts());
    } catch {
      toast.error("Could not load alerts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Radar alerts"
        description="Get notified when genuinely new or reposted roles match your filters. Repost alerts include original age."
        actions={
          <Link href="/app/radar/search" className={buttonVariants({ variant: "secondary" })}>
            Build from search
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : alerts.length === 0 ? (
            <EmptyState
              title="No alerts yet"
              description="Create an alert with a cadence and channel. Deliveries dedupe refreshes so you are not spammed."
            />
          ) : (
            alerts.map((alert) => (
              <Card key={alert.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{alert.name}</p>
                      <Badge tone={alert.active ? "success" : "neutral"}>
                        {alert.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-foreground-secondary">
                      {cadenceLabel[alert.cadence]} · {alert.channels.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      Created {formatRelative(alert.createdAt)}
                      {alert.lastTriggeredAt
                        ? ` · last triggered ${formatRelative(alert.lastTriggeredAt)}`
                        : ""}
                    </p>
                    {alert.query.freshnessType === "reposted_only" ? (
                      <p className="mt-2 text-xs text-foreground-secondary">
                        Repost alerts include the original age of the requisition.
                      </p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Create alert</CardTitle>
            <CardDescription>Adapter-based channels; cadence controls delivery</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertForm
              onSubmit={async (input) => {
                await radarApi.createAlert(input);
                toast.success("Alert created");
                await reload();
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
