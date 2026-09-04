"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { radarApi } from "@/services/radar-api";
import type { JobAlert, RadarSearchParams } from "@/types/radar";
import { formatRelative } from "@/lib/utils";

export default function RadarAlertsPage() {
  const [alerts, setAlerts] = useState<JobAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("Genuinely new matches");
  const [queryText, setQueryText] = useState("");
  const [cadence, setCadence] = useState<"immediate" | "hourly" | "daily">("daily");
  const [includeReposts, setIncludeReposts] = useState(false);
  const [includeRefreshes, setIncludeRefreshes] = useState(false);
  const [companyDirectOnly, setCompanyDirectOnly] = useState(false);
  const [strongOnly, setStrongOnly] = useState(true);
  const [saving, setSaving] = useState(false);

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

  async function createAlert() {
    setSaving(true);
    try {
      const query: RadarSearchParams = {
        q: queryText.trim() || undefined,
        freshnessType: "genuinely_new",
        companyDirectOnly: companyDirectOnly || undefined,
        matchScoreMin: strongOnly ? 75 : undefined,
        includeReposts,
      };
      await radarApi.createAlert({
        name: name.trim() || "New job alert",
        query,
        cadence,
        channels: ["in_app"],
        active: true,
      });
      toast.success("Alert saved");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create alert");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Radar alerts"
        description="Notify me when a genuinely new job matching this search appears."
        actions={
          <Link href="/app/radar" className={buttonVariants({ variant: "secondary" })}>
            Back to Radar
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
              description="Create an alert for genuinely new matches. Deliveries are deduplicated so the same role is not resent."
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
                      {alert.cadence} · {alert.channels.join(", ")}
                    </p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      Created {formatRelative(alert.createdAt)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Create alert</CardTitle>
            <CardDescription>In-app notifications first. Email stays behind a provider interface until configured.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alert-name">Name</Label>
              <Input id="alert-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-query">Matching search</Label>
              <Input id="alert-query" value={queryText} onChange={(event) => setQueryText(event.target.value)} placeholder="e.g. AI platform engineer" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="alert-cadence">Cadence</Label>
              <select
                id="alert-cadence"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={cadence}
                onChange={(event) => setCadence(event.target.value as typeof cadence)}
              >
                <option value="immediate">Immediate</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={includeReposts} onChange={(e) => setIncludeReposts(e.target.checked)} /> Include reposts</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={includeRefreshes} onChange={(e) => setIncludeRefreshes(e.target.checked)} /> Include refreshed jobs</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={companyDirectOnly} onChange={(e) => setCompanyDirectOnly(e.target.checked)} /> Company-direct only</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={strongOnly} onChange={(e) => setStrongOnly(e.target.checked)} /> Strong matches only</label>
            </div>
            <Button type="button" onClick={() => void createAlert()} disabled={saving}>
              {saving ? "Saving…" : "Create alert"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
