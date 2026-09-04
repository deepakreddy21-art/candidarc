"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { AuditWorkspace } from "@/components/audits/audit-workspace";

export default function OpportunityAuditsPage() {
  const params = useParams<{ opportunityId: string }>();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audits"
        description="Sequential HR and engineering reviews — each lens reviews the regenerated draft before it."
      />
      <AuditWorkspace applicationId={params.opportunityId} />
    </div>
  );
}
