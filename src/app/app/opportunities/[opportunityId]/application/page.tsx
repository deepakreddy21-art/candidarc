import { ApplicationCopilot } from "@/components/copilot/application-copilot";
import { PageHeader } from "@/components/layout/page-header";
import { applications } from "@/data/seed";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ opportunityId: string }>;
}) {
  const { opportunityId } = await params;
  const opportunity = applications.find((item) => item.id === opportunityId);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Application Copilot"
        description="Review every answer before anything reaches an employer form."
      />
      <ApplicationCopilot
        opportunityId={opportunityId}
        company={opportunity?.company}
        role={opportunity?.role}
      />
    </div>
  );
}
