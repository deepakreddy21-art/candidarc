import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const connectors = [
  {
    name: "CandidArc browser extension",
    status: "Prepare + supervised fill",
    detail: "Unpacked extension can save Greenhouse, Lever, or Ashby URLs and fill approved fields after you prepare a package. It stops for review and never submits.",
  },
  { name: "Greenhouse", status: "Ingest optional / autofill adapters", detail: "Live job boards require GREENHOUSE_LIVE=1. Autofill uses approved Answer Vault fields on greenhouse.io hosts and still requires your review." },
  { name: "Lever", status: "Fixtures / autofill adapters", detail: "Job ingest uses fixtures unless a licensed adapter is configured. Autofill maps approved fields on jobs.lever.co and never submits." },
  { name: "Ashby", status: "Fixtures / autofill adapters", detail: "Job ingest uses fixtures unless a licensed adapter is configured. Autofill maps approved fields on Ashby hosts and never submits." },
  { name: "LinkedIn", status: "Disabled", detail: "Autofill, scraping, and claiming LinkedIn API access from a profile URL are not supported." },
  { name: "Indeed", status: "Disabled", detail: "Requires an approved partner integration. Not live." },
  { name: "Email alerts", status: "Blocked", detail: "No mail provider is configured. In-app notifications work; the product will not claim email was sent." },
];

export default function IntegrationsPage() {
  return <div className="space-y-6">
    <PageHeader title="Integrations" description="Connect only the services you explicitly authorize." />
    <div className="grid gap-4 sm:grid-cols-2">
      {connectors.map((connector) => <Card key={connector.name}>
        <CardHeader><div className="flex items-center justify-between gap-3"><CardTitle>{connector.name}</CardTitle><span className="rounded-full bg-surface-2 px-2 py-1 text-xs">{connector.status}</span></div></CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-foreground-secondary">{connector.detail}</p>
          {connector.name.includes("extension") ? (
            <p className="text-xs text-foreground-muted">Load unpacked from the repo `extension/` folder. Do not publish or submit real applications from it.</p>
          ) : null}
        </CardContent>
      </Card>)}
    </div>
  </div>;
}
