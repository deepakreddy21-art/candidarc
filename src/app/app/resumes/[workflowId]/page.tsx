"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import { CreatingState } from "@/components/resumes/creating-state";
import { ResumeReady } from "@/components/resumes/resume-ready";
import { TechConfirmCard } from "@/components/resumes/tech-confirm-card";

type WorkflowData = {
  workflowId: string;
  applicationId: string;
  status: "queued" | "creating" | "completed" | "failed" | "needs_input";
  message: string;
  pipelineStage?: "understanding" | "tailoring" | "preparing";
  pipelineLabel?: string;
  elapsedMs?: number;
  techQuestions?: Array<{ id: string; technology: string; reason: string }>;
  resume?: { versionLabel: string; previewHtml?: string };
  versions?: Array<{ id: string; label: string; createdAt: string }>;
  downloads: { pdfReady: boolean; docxReady: boolean };
  qualityReport?: {
    summary?: string;
    score?: number;
    roleAlignment?: number;
    atsReadability?: number;
    verifiedClaims?: number;
    researchSourcesUsed?: number;
    remainingSkillGaps?: string[];
  };
  enhancementAvailable?: boolean;
  error?: string;
};

export default function CustomerResumePage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = use(params);
  const [data, setData] = useState<WorkflowData>();
  const [error, setError] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const statusRef = useRef<WorkflowData["status"] | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/resumes/workflows/${workflowId}`, { credentials: "include", cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load your resume");
      statusRef.current = body.status;
      setData(body);
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your resume");
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => {
      if (statusRef.current === "queued" || statusRef.current === "creating" || statusRef.current === "needs_input" || !statusRef.current) {
        void load();
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function retry() {
    setRetrying(true);
    try {
      const csrf = decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "");
      const response = await fetch(`/api/v1/resumes/workflows/${workflowId}/retry`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": csrf },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not retry");
      statusRef.current = "queued";
      await load();
    } catch (retryError) {
      toast.error(retryError instanceof Error ? retryError.message : "Could not retry");
    } finally {
      setRetrying(false);
    }
  }

  if (error && !data) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!data || data.status === "queued" || data.status === "creating" || data.status === "needs_input") {
    return (
      <CreatingState
        pipelineStage={data?.pipelineStage}
        pipelineLabel={data?.pipelineLabel ?? data?.message}
        elapsedMs={data?.elapsedMs}
        needsInput={data?.status === "needs_input"}
      >
        {data?.techQuestions?.length ? <TechConfirmCard workflowId={workflowId} questions={data.techQuestions} /> : null}
      </CreatingState>
    );
  }
  if (data.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorState title="We couldn’t create your resume" description={data.error ?? data.message} />
        <Button onClick={retry} disabled={retrying}>{retrying ? "Retrying…" : "Retry"}</Button>
      </div>
    );
  }
  return <ResumeReady data={data} />;
}
