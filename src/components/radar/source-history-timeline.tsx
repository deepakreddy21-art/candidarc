"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate, formatRelative } from "@/lib/utils";
import type { RadarHistoryEvent } from "@/types/radar";

export function SourceHistoryTimeline({
  events,
  className,
}: {
  events: RadarHistoryEvent[];
  className?: string;
}) {
  const reduce = useReducedMotion();
  const sorted = [...events].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Source history</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-foreground-muted">No history events yet.</p>
        ) : (
          <ol className="relative space-y-0 border-l border-border pl-5">
            {sorted.map((event, idx) => (
              <motion.li
                key={event.id}
                className="relative pb-5 last:pb-0"
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.04 }}
              >
                <span
                  className={cn(
                    "absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface",
                    event.type === "repost_detected"
                      ? "bg-warning"
                      : event.type === "verified"
                        ? "bg-success"
                        : event.type === "discovered"
                          ? "bg-cyan"
                          : "bg-accent",
                  )}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{event.title}</p>
                  {event.demoData ? <Badge tone="neutral">Demo fixture</Badge> : null}
                </div>
                <p className="mt-1 text-sm text-foreground-secondary">{event.detail}</p>
                <p className="mt-1.5 text-xs text-foreground-muted">
                  {formatRelative(event.at)} · {formatDate(event.at, { hour: "numeric", minute: "2-digit" })}
                  {event.sourceName ? ` · ${event.sourceName}` : ""}
                </p>
              </motion.li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
