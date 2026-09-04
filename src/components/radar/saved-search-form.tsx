"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { RadarSearchParams } from "@/types/radar";

export function SavedSearchForm({
  initialQuery,
  onSubmit,
  submitting,
}: {
  initialQuery: RadarSearchParams;
  onSubmit: (input: { name: string; query: RadarSearchParams }) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [name, setName] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onSubmit({ name: name.trim(), query: initialQuery });
        setName("");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="saved-search-name">Search name</Label>
        <Input
          id="saved-search-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Remote AI · last 24h · genuinely new"
          required
        />
      </div>
      <p className="text-xs text-foreground-muted">
        Saves the full filter state (keywords, freshness, repost type, match score, and more) so you
        can reopen or alert on it later.
      </p>
      <Button type="submit" disabled={submitting || !name.trim()}>
        {submitting ? "Saving…" : "Save search"}
      </Button>
    </form>
  );
}
