import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { candidate } from "@/data/seed";
import { greetingForHour } from "@/lib/utils";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${greetingForHour()}, ${candidate.preferredName}`}
        description="The few actions most likely to move your search forward today."
        actions={
          <Link href="/app/radar" className={buttonVariants()}>
            Open Radar
          </Link>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <ActionCard title="3 new priority matches" href="/app/radar/search" action="Review matches">
          Anthropic · Applied AI Engineer<br />Stripe · ML Platform Engineer<br />OpenAI · Software Engineer, Search
        </ActionCard>
        <ActionCard title="1 application ready for review" href="/app/opportunities/app-cisco/application" action="Review Cisco application">
          Cisco · CX AI Software Engineer<br />Resume V4 and reusable answers are prepared.
        </ActionCard>
        <ActionCard title="2 follow-ups due" href="/app/opportunities" action="Review follow-ups">
          Superhuman recruiter · due today<br />DoorDash hiring team · due tomorrow
        </ActionCard>
        <ActionCard title="1 saved role was reposted" href="/app/radar/saved" action="See repost">
          Senior Software Engineer, AI · refreshed 3 hours ago
        </ActionCard>
        <ActionCard title="1 resume needs evidence confirmation" href="/app/opportunities/app-cisco/evidence" action="Confirm evidence">
          Confirm the Kubernetes deployment boundary before export.
        </ActionCard>
      </div>
    </div>
  );
}

function ActionCard({ title, href, action, children }: { title: string; href: string; action: string; children: React.ReactNode }) {
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      <p className="mb-4 text-sm leading-6 text-foreground-secondary">{children}</p>
      <Link href={href} className={buttonVariants({ variant: "secondary", size: "sm" })}>{action}</Link>
    </CardContent></Card>
  );
}
