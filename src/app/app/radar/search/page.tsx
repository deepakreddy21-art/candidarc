"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/feedback";

/** Legacy search route — preserve query params into the unified Radar feed. */
function RedirectSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const next = new URLSearchParams(searchParams.toString());
    if (!next.get("tab")) next.set("tab", "best");
    router.replace(`/app/radar?${next.toString()}`);
  }, [router, searchParams]);
  return <Skeleton className="h-64 w-full" />;
}

export default function RadarSearchRedirectPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RedirectSearch />
    </Suspense>
  );
}
