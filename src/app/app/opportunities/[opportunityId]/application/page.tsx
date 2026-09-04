import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  return (
    <div className="space-y-6">
      <PageHeader title="Application" description="Application Copilot is no longer in the customer navigation." />
      <Card>
        <CardContent className="p-6">
          <EmptyState
            title="Review your tailored resume instead"
            description="Download and refine your resume from the customer workflow, then submit applications on the employer site."
            action={
              <Link href={`/app/opportunities/${opportunityId}`} className={buttonVariants()}>
                Back to overview
              </Link>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
