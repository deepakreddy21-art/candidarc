"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EvidenceRoleMatrix } from "@/components/research/research-workspace";
import { api } from "@/services/api";
import type { EvidenceRoleMatrixRow } from "@/types/domain";

export default function OpportunityEvidencePage() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const [rows, setRows] = useState<EvidenceRoleMatrixRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.listResearch(opportunityId);
        if (!cancelled) setRows(Array.isArray(data.matrix) ? data.matrix : []);
      } catch {
        if (!cancelled) {
          setRows([]);
          setError("Evidence matching is not available for this opportunity yet.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opportunityId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evidence match"
        description="Map job requirements to Career Evidence you control. Approve, replace, or lock evidence for this opportunity."
      />
      {error ? <p className="text-sm text-foreground-secondary">{error}</p> : null}
      {rows.length ? (
        <EvidenceRoleMatrix rows={rows} />
      ) : (
        <p className="text-sm text-foreground-secondary">
          No evidence matrix yet. Add Career Evidence from your profile, then regenerate this application.
        </p>
      )}
    </div>
  );
}
