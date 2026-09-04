import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  return (
    <div className="space-y-6">
      <PageHeader title="Activity" description="This view has moved to the application overview." />
      <Card>
        <CardContent className="p-6">
          <EmptyState
            title="Activity lives on the overview"
            description="Recent workflow updates now appear on your application overview page."
            action={
              <Link href={`/app/opportunities/${opportunityId}`} className={buttonVariants()}>
                Open overview
              </Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
