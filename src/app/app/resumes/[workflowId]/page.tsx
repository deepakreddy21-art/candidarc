"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/feedback";
import type { ResumeDocument } from "@/types/resume-document";
import { CreatingState } from "@/components/resumes/creating-state";
import { ResumeReady } from "@/components/resumes/resume-ready";
import { ResearchSummary } from "@/components/resumes/research-summary";
import type { ResumeResearch } from "@/types/resume-research";
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
  resume?: { versionLabel: string; previewHtml?: string; document?: ResumeDocument; sections?: unknown[]; role?: string; company?: string; candidateName?: string };
  versions?: Array<{ id: string; label: string; createdAt: string }>;
  downloads: { pdfReady: boolean; docxReady: boolean };
  documentRetryAvailable?: boolean;
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
  refinementNotice?: string;
  localOnlyEdits?: boolean;
  research?: ResumeResearch;
  error?: string;
};

export default function CustomerResumePage({ params }: { params: Promise<{ workflowId: string }> }) {
  const { workflowId } = use(params);
  const [data, setData] = useState<WorkflowData>();
  const [error, setError] = useState<string>();
  const [retrying, setRetrying] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const statusRef = useRef<WorkflowData["status"] | undefined>(undefined);

  const load = useCallback(async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    try {
      const response = await fetch(`/api/v1/resumes/workflows/${workflowId}`, { credentials: "include", cache: "no-store", signal });
      const body = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not load your resume");
      statusRef.current = body.status;
      setData(body);
      setError(undefined);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(signal.aborted ? "The connection timed out. Your saved resume is safe; retry to check progress." : loadError instanceof Error ? loadError.message : "Could not load your resume");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [workflowId]);

  useEffect(() => {
    statusRef.current = undefined;
    setData(undefined);
    setError(undefined);
    void load();
    const interval = window.setInterval(() => {
      if (document.hidden) return;
      if (statusRef.current === "queued" || statusRef.current === "creating" || statusRef.current === "needs_input" || !statusRef.current) {
        void load();
      }
    }, 2000);
    const onVisible = () => { if (!document.hidden) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); requestRef.current?.abort(); requestRef.current = null; };
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

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!data || (data.workflowId !== workflowId && data.applicationId !== workflowId) || data.status === "queued" || data.status === "creating" || data.status === "needs_input") {
    return (
      <CreatingState
        pipelineStage={data?.pipelineStage}
        pipelineLabel={data?.pipelineLabel ?? data?.message}
        elapsedMs={data?.elapsedMs}
        needsInput={data?.status === "needs_input"}
      >
        <ResearchSummary research={data?.research} />
        {data?.status === "needs_input" && data?.techQuestions?.length ? (
          <TechConfirmCard workflowId={workflowId} questions={data.techQuestions} />
        ) : null}
      </CreatingState>
    );
  }
  if (data.status === "failed") {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <ErrorState title="We couldn’t create your resume" description={data.error ?? data.message} />
        <Button onClick={retry} disabled={retrying}>{retrying ? "Retrying…" : data.localOnlyEdits ? "Resume saved work" : "Retry Generation"}</Button>
      </div>
    );
  }
  return <ResumeReady data={data} onRetryDocuments={() => void retry()} retryingDocuments={retrying} />;
}
