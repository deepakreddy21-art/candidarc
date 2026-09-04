"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefinePanel } from "./refine-panel";
import { VersionHistory } from "./version-history";
import { QualityReport } from "./quality-report";

type ReadyData = {
  workflowId: string;
  applicationId: string;
  resume?: { versionLabel: string; previewHtml?: string };
  versions?: Array<{ id: string; label: string; createdAt: string }>;
  qualityReport?: {
    summary?: string;
    score?: number;
    roleAlignment?: number;
    atsReadability?: number;
    verifiedClaims?: number;
    researchSourcesUsed?: number;
    remainingSkillGaps?: string[];
  };
  downloads: { pdfReady: boolean; docxReady: boolean };
  enhancementAvailable?: boolean;
};

export function ResumeReady({ data }: { data: ReadyData }) {
  const router = useRouter();
  const [enhancing, setEnhancing] = useState(false);

  async function enhance() {
    setEnhancing(true);
    try {
      const csrf = decodeURIComponent(document.cookie.split("; ").find((item) => item.startsWith("csrf_token="))?.split("=")[1] ?? "");
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
          <p className="text-sm text-success">Ready</p>
          <h1 className="text-3xl font-semibold">Your tailored resume</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild disabled={!data.downloads.pdfReady}>
            <a href={`/api/v1/resumes/workflows/${data.workflowId}/download?format=pdf`}>
              <Download className="h-4 w-4" />
              Download PDF
            </a>
          </Button>
          <Button asChild variant="secondary" disabled={!data.downloads.docxReady}>
            <a href={`/api/v1/resumes/workflows/${data.workflowId}/download?format=docx`}>
              <FileText className="h-4 w-4" />
              Download Word
            </a>
          </Button>
          <Button asChild variant="ghost">
            <Link href={`/app/opportunities/${data.applicationId}/resume`}>Edit manually</Link>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{data.resume?.versionLabel ?? "Version 1"}</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="mx-auto min-h-[700px] max-w-[760px] rounded-sm border border-border bg-white p-8 text-black shadow-sm [&_pre]:whitespace-pre-wrap [&_pre]:font-sans [&_pre]:text-sm"
            dangerouslySetInnerHTML={{ __html: data.resume?.previewHtml ?? "" }}
          />
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <RefinePanel workflowId={data.workflowId} />
        <VersionHistory versions={data.versions ?? []} />
      </div>
      <QualityReport report={data.qualityReport} />
    </div>
  );
}
