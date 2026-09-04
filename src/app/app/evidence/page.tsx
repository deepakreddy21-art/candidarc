import { PageHeader } from "@/components/layout/page-header";
import { EvidenceVault } from "@/components/evidence/evidence-vault";

export default function EvidencePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidence Vault"
        description="Verified STAR stories, metrics, and privacy controls that power every resume claim."
      />
      <EvidenceVault />
    </div>
  );
}
