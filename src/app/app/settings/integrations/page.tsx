import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const connectors = [
  { name: "CandidArc browser extension", status: "Available", detail: "Prepare applications on Greenhouse, Lever, and Ashby." },
  { name: "Greenhouse", status: "Ready", detail: "Detected through user-opened employer application pages." },
  { name: "Lever", status: "Ready", detail: "Detected through user-opened employer application pages." },
  { name: "Ashby", status: "Ready", detail: "Detected through user-opened employer application pages." },
  { name: "LinkedIn", status: "Disabled", detail: "Autofill and scraping are not supported." },
  { name: "Indeed", status: "Disabled", detail: "Connector requires an approved partner integration." },
];

export default function IntegrationsPage() {
  return <div className="space-y-6">
    <PageHeader title="Integrations" description="Connect only the services you explicitly authorize." />
    <div className="grid gap-4 sm:grid-cols-2">
      {connectors.map((connector) => <Card key={connector.name}>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{connector.name}</CardTitle><span className="rounded-full bg-surface-2 px-2 py-1 text-xs">{connector.status}</span></div></CardHeader>
        <CardContent><p className="mb-4 text-sm text-foreground-secondary">{connector.detail}</p>{connector.name.includes("extension") ? <Button size="sm">Install extension</Button> : null}</CardContent>
      </Card>)}
    </div>
  </div>;
}
