import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { activities } from "@/data/seed";
import { formatRelative } from "@/lib/utils";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const events = activities.filter((event) => event.applicationId === opportunityId);
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="A durable timeline for this opportunity." />
      <Card>
        <CardContent className="p-5">
          <ol className="space-y-0">
            {events.map((event, index) => (
              <li key={event.id} className="relative grid grid-cols-[20px_1fr] gap-3 pb-6 last:pb-0">
                {index < events.length - 1 ? <span className="absolute left-[9px] top-4 h-full w-px bg-border" /> : null}
                <span className="relative mt-1 h-5 w-5 rounded-full border-4 border-surface bg-accent" />
                <div>
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-sm text-foreground-secondary">{event.description}</p>
                  <p className="mt-1 text-xs text-foreground-muted">{formatRelative(event.timestamp)}</p>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
