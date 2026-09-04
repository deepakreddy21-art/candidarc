"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ResearchWorkspace } from "@/components/research/research-workspace";

export default function OpportunityResearchPage() {
  const params = useParams<{ opportunityId: string }>();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Research"
        description="Verified facts and careful inference for this role — never mixed silently."
      />
      <ResearchWorkspace applicationId={params.opportunityId} />
    </div>
  );
}
