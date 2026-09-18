"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { product } from "@/config/product";

const BILLING_BLOCKED_REASON = "Billing portal is not configured in this environment. No charges are available.";

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description={`Plans for serious candidates using ${product.name}.`} />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Pro · monthly</CardTitle>
            <Badge tone="success">Demo</Badge>
          </div>
          <CardDescription>Unlimited opportunities, sequential audits, Radar, and Application Copilot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground-secondary">{BILLING_BLOCKED_REASON}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled title={BILLING_BLOCKED_REASON} aria-describedby="billing-unavailable">
              Manage billing
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled
              title={BILLING_BLOCKED_REASON}
              aria-describedby="billing-unavailable"
            >
              Download latest invoice
            </Button>
          </div>
          <p id="billing-unavailable" className="text-xs text-foreground-muted">
            {BILLING_BLOCKED_REASON}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <Usage label="Applications" value="—" />
          <Usage label="Audit cycles" value="—" />
          <Usage label="Copilot packages" value="—" />
        </CardContent>
      </Card>
    </div>
  );
}

function Usage({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border px-4 py-3">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
