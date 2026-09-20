import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/tabs";

export default function PreferencesPage() {
  return <div className="max-w-3xl space-y-6">
    <PageHeader title="Preferences" description="Résumé defaults and notification cadence." />
    <Link href="/app/settings/job-preferences" className="inline-block text-accent underline underline-offset-4">Edit job preferences</Link>
    <Card><CardContent className="space-y-5 p-5">
      <div>
        <div className="flex items-center justify-between gap-3 text-sm"><span>Weekly email digest</span><Switch checked={false} disabled aria-label="Email digest" aria-describedby="digest-unavailable" /></div>
        <p id="digest-unavailable" className="mt-2 text-sm text-foreground-secondary">Email digests are not available yet. No subscription is active.</p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 text-sm"><span>Default to one-page résumés</span><Switch checked={false} disabled aria-label="One page default" aria-describedby="length-unavailable" /></div>
        <p id="length-unavailable" className="mt-2 text-sm text-foreground-secondary">A saved page-length default is not supported yet. Review the document length in each resume preview.</p>
      </div>
    </CardContent></Card>
  </div>;
}
