"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EvidenceRoleMatrix } from "@/components/research/research-workspace";
import { evidenceRoleMatrix } from "@/data/seed";

export default function OpportunityEvidencePage() {
  useParams<{ opportunityId: string }>();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidence match"
        description="Map job requirements to Career Evidence you control. Approve, replace, or lock evidence for this opportunity."
      />
      <EvidenceRoleMatrix rows={evidenceRoleMatrix} />
    </div>
  );
}
