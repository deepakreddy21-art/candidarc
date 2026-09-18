import { Skeleton } from "@/components/ui/feedback";

export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" data-testid="route-loading" className="space-y-3">
      <span className="sr-only">Loading page</span>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
