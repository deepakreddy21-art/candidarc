"use client";

import { toast } from "sonner";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { product } from "@/config/product";

export default function BillingSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description={`Plans for serious candidates using ${product.name}.`} />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Pro · monthly</CardTitle>
            <Badge tone="success">Active</Badge>
          </div>
          <CardDescription>Unlimited opportunities, sequential audits, Radar, and Application Copilot.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => toast.message("Opening billing portal")}>
            Manage billing
          </Button>
          <Button type="button" variant="secondary" onClick={() => toast.success("Invoice emailed")}>
            Download latest invoice
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Usage this period</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
          <Usage label="Applications" value="3" />
          <Usage label="Audit cycles" value="4" />
          <Usage label="Copilot packages" value="1" />
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
