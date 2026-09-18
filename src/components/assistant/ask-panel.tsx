"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  proposedWrite?: { id?: string; summary: string; approved?: boolean; after?: string };
};

export function AskPanel({
  contextType,
  contextId,
  company,
  role,
  jobDescription,
}: {
  contextType: "job" | "resume" | "application";
  contextId: string;
  company?: string;
  role?: string;
  jobDescription?: string;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState("");

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoaded(false);
    void fetch(
      `/api/v1/assistant?contextType=${encodeURIComponent(contextType)}&contextId=${encodeURIComponent(contextId)}`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        setMessages(body.messages ?? []);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, contextType, contextId]);

  async function send(text = message) {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    setLastSent(text);
    try {
      const csrf = decodeURIComponent(
        document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "",
      );
      const response = await fetch("/api/v1/assistant", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          contextType,
          contextId,
          message: text,
          company,
          role,
          jobDescription,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not send that question");
      setMessages(body.messages ?? []);
      setMessage("");
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that question");
    } finally {
      setBusy(false);
    }
  }

  async function approve(proposalId: string) {
    setBusy(true);
    try {
      const csrf = decodeURIComponent(
        document.cookie.split("; ").find((item) => item.startsWith("candidarc_csrf="))?.split("=")[1] ?? "",
      );
      const response = await fetch("/api/v1/assistant/apply", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ contextType, contextId, proposalId }),
      });
      const body = await response.json();
      setMessages(body.messages ?? []);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Ask about this {contextType}
      </Button>
    );
  }

  return (
    <aside className="rounded-xl border border-border bg-surface p-3" aria-label="Career copilot">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium">Ask about this {contextType}</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
      <p className="mb-2 text-xs text-foreground-muted">
        Read-only by default. Suggested edits require your approval. This assistant will not invent facts.
      </p>
      <div className="mb-2 max-h-56 space-y-2 overflow-y-auto text-sm" data-testid="assistant-thread">
        {!loaded ? <p className="text-xs text-foreground-muted">Loading conversation…</p> : null}
        {messages.map((item) => (
          <div key={item.id} className="rounded-md border border-border p-2" data-role={item.role}>
            <p className="text-xs uppercase text-foreground-muted">{item.role}</p>
            <p className="mt-1 whitespace-pre-wrap">{item.content}</p>
            {item.citations?.length ? (
              <p className="mt-1 text-xs text-foreground-muted">Sources: {item.citations.join(" · ")}</p>
            ) : null}
            {item.proposedWrite ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs">
                  {item.proposedWrite.approved ? "Approved (apply from the resume editor):" : "Proposed write (not applied):"}{" "}
                  {item.proposedWrite.summary}
                </p>
                {item.proposedWrite.after ? (
                  <p className="text-xs text-foreground-muted">{item.proposedWrite.after}</p>
                ) : null}
                {item.proposedWrite.id && !item.proposedWrite.approved ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void approve(item.proposedWrite!.id!)}
                  >
                    Approve suggestion
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <Textarea
        aria-label="Ask the copilot"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
      />
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" onClick={() => void send()} disabled={busy || !message.trim()}>
          {busy ? "Sending…" : "Send"}
        </Button>
        {error && lastSent ? (
          <Button type="button" variant="secondary" onClick={() => void send(lastSent)} disabled={busy}>
            Retry
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
