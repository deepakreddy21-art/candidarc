"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: string[];
  proposedWrite?: { summary: string };
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

  useEffect(() => {
    if (!open) return;
    void fetch(
      `/api/v1/assistant?contextType=${encodeURIComponent(contextType)}&contextId=${encodeURIComponent(contextId)}`,
      { credentials: "include" },
    )
      .then((res) => res.json())
      .then((body) => setMessages(body.messages ?? []))
      .catch(() => setMessages([]));
  }, [open, contextType, contextId]);

  async function send() {
    if (!message.trim()) return;
    setBusy(true);
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
          message,
          company,
          role,
          jobDescription,
        }),
      });
      const body = await response.json();
      setMessages(body.messages ?? []);
      setMessage("");
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
      <div className="mb-2 max-h-56 space-y-2 overflow-y-auto text-sm">
        {messages.map((item) => (
          <div key={item.id} className="rounded-md border border-border p-2">
            <p className="text-xs uppercase text-foreground-muted">{item.role}</p>
            <p className="mt-1 whitespace-pre-wrap">{item.content}</p>
            {item.citations?.length ? (
              <p className="mt-1 text-xs text-foreground-muted">Sources: {item.citations.join(" · ")}</p>
            ) : null}
            {item.proposedWrite ? (
              <p className="mt-1 text-xs">Proposed write (not applied): {item.proposedWrite.summary}</p>
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
      <Button type="button" className="mt-2" onClick={() => void send()} disabled={busy}>
        {busy ? "Sending…" : "Send"}
      </Button>
    </aside>
  );
}
