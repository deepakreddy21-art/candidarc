"use client";

import { ErrorState } from "@/components/ui/feedback";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return <ErrorState title="This page failed to load" description={error.message} onRetry={reset} />;
}
