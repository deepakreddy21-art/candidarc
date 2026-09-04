import { PageHeader } from "@/components/layout/page-header";
import { InsightsPanel } from "@/components/insights/insights-panel";

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights"
        description="Score lineage, evidence coverage, and repeated audit themes across your pipeline."
      />
      <InsightsPanel />
    </div>
  );
}
