"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ResumeStudio } from "@/components/resume/resume-studio";

export default function OpportunityResumePage() {
  const params = useParams<{ opportunityId: string }>();
  return (
    <div className="space-y-6">
      <PageHeader title="Resume studio" description="Version lineage, scoring, and export for this opportunity." />
      <ResumeStudio applicationId={params.opportunityId} />
    </div>
  );
}
