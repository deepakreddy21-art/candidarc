"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/services/api";
import type { Application } from "@/types/domain";

type Prep = {
  sourced: string[];
  star: Array<{
    kind: "star";
    prompt: string;
    outline: { situation: string; task: string; action: string; result: string };
  }>;
  generated: Array<{ kind: string; prompt: string }>;
};

export default function InterviewPrepPage() {
  const params = useParams<{ opportunityId: string }>();
  const [app, setApp] = useState<Application | null | undefined>(undefined);
  const [prep, setPrep] = useState<Prep | null>(null);

  useEffect(() => {
    void api.getApplication(params.opportunityId).then((found) => setApp(found ?? null));
    void fetch(`/api/v1/applications/${params.opportunityId}/interview-prep`, { credentials: "include" })
      .then((res) => res.json())
      .then((body) => {
        if (body.sourced) setPrep(body);
      })
      .catch(() => setPrep(null));
  }, [params.opportunityId]);

  if (app === undefined) return <Skeleton className="h-40 w-full" />;
  if (!app) {
    return (
      <EmptyState
        title="Application not found"
        description="It may have been archived or you may not have access."
        action={
          <Link href="/app/opportunities" className={buttonVariants()}>
            Back
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title={`Interview prep · ${app.role}`}
        description={`${app.company}. Practice below is generated from your evidence and the posting. It is not a list of real company interview questions.`}
        actions={
          <Link href={`/app/opportunities/${app.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Back to application
          </Link>
        }
      />
      <section className="space-y-2 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">Sourced vs generated</h2>
        {(prep?.sourced ?? []).map((item) => (
          <p key={item} className="text-sm text-foreground-secondary">
            {item}
          </p>
        ))}
      </section>
      <section className="space-y-3 rounded-xl border border-border p-4">
        <h2 className="text-sm font-medium">STAR outlines from your evidence</h2>
        {(prep?.star ?? []).length ? (
          prep!.star.map((item) => (
            <article key={item.prompt} className="space-y-1 text-sm">
              <p className="font-medium">{item.prompt}</p>
              <p>Situation: {item.outline.situation}</p>
              <p>Task: {item.outline.task}</p>
              <p>Action: {item.outline.action}</p>
              <p>Result: {item.outline.result}</p>
            </article>
          ))
        ) : (
          <p className="text-sm text-foreground-muted">Add employment or projects on Profile to build STAR outlines.</p>
        )}
      </section>
      <ol className="list-decimal space-y-3 pl-5 text-sm text-foreground-secondary">
        {(prep?.generated ?? []).map((item) => (
          <li key={item.prompt}>
            <span className="text-xs uppercase text-foreground-muted">{item.kind} · generated</span>
            <p>{item.prompt}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
