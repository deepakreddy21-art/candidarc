"use client";

import { Suspense } from "react";
import { Skeleton } from "@/components/ui/feedback";
import { RadarFeed } from "@/components/radar/radar-feed";

export default function RadarHomePage() {
  return (
    <Suspense fallback={<div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>}>
      <RadarFeed />
    </Suspense>
  );
}
