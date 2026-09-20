"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumeDocument } from "@/types/resume-document";
import { buildResumeDocument } from "@/lib/resume-document";
import { ResumePreview } from "./resume-preview";
import { RefinePanel } from "./refine-panel";
import { ResumeComparison } from "./resume-comparison";
import { VersionHistory } from "./version-history";
import { QualityReport } from "./quality-report";
import { AskPanel } from "@/components/assistant/ask-panel";
import type { WritingReview } from "@/lib/resume-writing-review";

type ReadyData = {
  workflowId: string;
  applicationId: string;
  resume?: {
    versionLabel: string;
    versionId?: string;
    previewHtml?: string;
    /** Canonical document including contact — preferred over reconstructing from sections. */
    document?: ResumeDocument;
    sections?: unknown[];
    role?: string;
    company?: string;
    candidateName?: string;
  };
  versions?: Array<{ id: string; label: string; createdAt: string }>;
  qualityReport?: {
    languageReview?: import("@/lib/resume-writing-review").LanguageReviewCheck[];
    writingReview?: WritingReview;
    summary?: string;
    score?: number;
    roleAlignment?: number;
    atsReadability?: number;
    verifiedClaims?: number;
    researchSourcesUsed?: number;
    remainingSkillGaps?: string[];
  };
  downloads: { pdfReady: boolean; docxReady: boolean };
  documentRetryAvailable?: boolean;
  enhancementAvailable?: boolean;
  refinementNotice?: string;
};

export function ResumeReady({
  data,
  onRetryDocuments,
  retryingDocuments,
}: {
  data: ReadyData;
  onRetryDocuments?: () => void;
  retryingDocuments?: boolean;
}) {
  const router = useRouter();
  const [enhancing, setEnhancing] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [compareId, setCompareId] = useState<string | undefined>();

  const resumeDoc = useMemo(() => {
    if (data.resume?.document) return data.resume.document;
    const sections = data.resume?.sections;
    if (!Array.isArray(sections) || sections.length === 0) return null;
    return buildResumeDocument({
      sections,
      candidateName: data.resume?.candidateName ?? "Candidate",
      role: data.resume?.role ?? "",
      company: data.resume?.company ?? "",
    });
  }, [data.resume]);

  async function enhance() {
    setEnhancing(true);
    try {
      const csrf = decodeURIComponent(
        globalThis.document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "",
      );
      const response = await fetch(`/api/v1/resumes/workflows/${data.workflowId}/enhance`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: "{}",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not create an enhanced version");
      router.push(`/app/resumes/${body.workflowId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create an enhanced version");
    } finally {
      setEnhancing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {data.refinementNotice ? <p role="status" className="rounded-lg border border-border bg-mint p-3 text-sm">{data.refinementNotice}</p> : null}
      {data.enhancementAvailable ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <p className="text-sm">New evidence added. Create an enhanced version?</p>
            <Button type="button" onClick={enhance} disabled={enhancing}>
              {enhancing ? "Starting…" : "Create enhanced version"}
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="focus-ready-eyebrow"><Check aria-hidden />Ready for your review</p>
          <h1 className="text-3xl font-semibold">Your tailored resume</h1>
          <p className="mt-1 font-medium text-foreground-secondary">{[data.resume?.role, data.resume?.company].filter(Boolean).join(" · ")}</p>
          <p className="mt-2 text-sm text-foreground-secondary">Review. Download. Make your next move.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.downloads.pdfReady ? <Button asChild>
            <a href={`/api/v1/resumes/workflows/${data.workflowId}/download?format=pdf`}>
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </Button>
          : <Button disabled><Download className="h-4 w-4" />Download PDF</Button>}
          {data.downloads.docxReady ? <Button asChild variant="secondary">
            <a href={`/api/v1/resumes/workflows/${data.workflowId}/download?format=docx`}>
              <FileText className="h-4 w-4" />
              Download DOCX
            </a>
          </Button>
          : <Button disabled variant="secondary"><FileText className="h-4 w-4" />Download DOCX</Button>}
          {data.documentRetryAvailable && (!data.downloads.pdfReady || !data.downloads.docxReady) ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => onRetryDocuments?.()}
              disabled={retryingDocuments || !onRetryDocuments}
            >
              {retryingDocuments ? "Retrying…" : !data.downloads.pdfReady ? "Retry PDF" : "Retry DOCX"}
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <Link href="/app/opportunities">View applications</Link>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{data.resume?.versionLabel ?? "Version 1"}</CardTitle>
        </CardHeader>
        <CardContent className="focus-ready-stage">
          {resumeDoc ? (
            <ResumePreview document={resumeDoc} onSelectionChange={setSelectedText} />
          ) : data.resume?.previewHtml ? (
            <iframe
              title="Resume preview"
              className="mx-auto min-h-[700px] w-full max-w-[760px] rounded-sm border border-border bg-white shadow-sm"
              sandbox=""
              srcDoc={data.resume.previewHtml}
            />
          ) : (
            <p className="text-sm text-foreground-muted">Preview will appear when your resume finishes generating.</p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <RefinePanel workflowId={data.workflowId} selectedText={selectedText} onClearSelection={() => setSelectedText("")} />
        <VersionHistory
          versions={data.versions ?? []}
          currentId={data.resume?.versionId ?? data.versions?.[0]?.id}
          onCompare={setCompareId}
        />
      </div>
      {compareId && resumeDoc ? (
        <ResumeComparison workflowId={data.workflowId} versionId={compareId} current={resumeDoc} onClose={() => setCompareId(undefined)} />
      ) : null}
      <AskPanel contextType="resume" contextId={data.workflowId} role={data.resume?.role} company={data.resume?.company} />
      <QualityReport report={data.qualityReport} onReviewText={(text) => {
        setSelectedText(text);
        const editor = globalThis.document.getElementById("refinement");
        editor?.scrollIntoView({ block: "center", behavior: "auto" });
        editor?.focus({ preventScroll: true });
      }} />
    </div>
  );
}
