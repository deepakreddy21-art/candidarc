"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import type { AlertCadence, AlertChannel, JobAlert, RadarSearchParams } from "@/types/radar";

const CADENCES: Array<{ value: AlertCadence; label: string }> = [
  { value: "near_realtime", label: "Near real time" },
  { value: "every_15m", label: "Every 15 minutes" },
  { value: "hourly", label: "Hourly" },
  { value: "every_3h", label: "Every 3 hours" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "paused", label: "Paused" },
];

const CHANNELS: Array<{ value: AlertChannel; label: string }> = [
  { value: "in_app", label: "In-app" },
  { value: "email", label: "Email" },
  { value: "push", label: "Push" },
];

export function AlertForm({
  initialQuery,
  onSubmit,
  submitting,
}: {
  initialQuery?: RadarSearchParams;
  onSubmit: (input: Omit<JobAlert, "id" | "createdAt">) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<AlertCadence>("hourly");
  const [channels, setChannels] = useState<AlertChannel[]>(["in_app"]);

  function toggleChannel(channel: AlertChannel) {
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel],
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || channels.length === 0) return;
        await onSubmit({
          name: name.trim(),
          query: initialQuery ?? {
            freshnessType: "genuinely_new",
            freshnessPreset: "24h",
            freshnessBasis: "discovered",
            matchScoreMin: 75,
          },
          cadence,
          channels,
          active: cadence !== "paused",
        });
        setName("");
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="alert-name">Alert name</Label>
        <Input
          id="alert-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Genuinely new AI roles"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="alert-cadence">Cadence</Label>
        <select
          id="alert-cadence"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as AlertCadence)}
          className="flex h-10 w-full rounded-[11px] border border-border-strong bg-surface px-3 text-sm"
        >
          {CADENCES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Channels</legend>
        <div className="flex flex-wrap gap-3">
          {CHANNELS.map((c) => (
            <label key={c.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={channels.includes(c.value)}
                onChange={() => toggleChannel(c.value)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="text-xs text-foreground-muted">
        Repost alerts include original age. Repeated source refreshes do not spam deliveries.
        Channels are adapter-based; delivery depends on configured providers.
      </p>

      <Button type="submit" disabled={submitting || !name.trim() || channels.length === 0}>
        {submitting ? "Creating…" : "Create alert"}
      </Button>
    </form>
  );
}
