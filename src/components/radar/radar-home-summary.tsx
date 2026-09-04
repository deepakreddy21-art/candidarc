"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import type { RadarHomeSummary } from "@/types/radar";

export function RadarHomeSummaryCards({ summary }: { summary: RadarHomeSummary }) {
  const reduce = useReducedMotion();
  const items = [
    {
      label: "Strong matches",
      value: summary.strongMatches,
      detail: `discovered in the ${summary.windowLabel}`,
    },
    { label: "Genuinely new", value: summary.genuinelyNew, detail: "no prior matching requisition" },
    { label: "Reposted", value: summary.reposted, detail: "previously known roles appearing again" },
    {
      label: "Uncertain dates",
      value: summary.uncertainDates,
      detail: "original posting time estimated or unknown",
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, idx) => (
        <motion.div
          key={item.label}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.05 }}
        >
          <Card>
            <CardContent className="p-4 sm:p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground-muted">
                {item.label}
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{item.value}</p>
              <p className="mt-1 text-xs text-foreground-secondary">{item.detail}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
