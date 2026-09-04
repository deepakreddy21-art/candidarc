import { Card, CardContent } from "@/components/ui/card";

export function CreatingState({ children }: { children?: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <CardContent className="flex min-h-56 flex-col items-center justify-center gap-5 text-center">
          <div className="relative h-12 w-12" aria-hidden>
            <span className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
            <span className="absolute inset-2 rounded-full border-2 border-accent border-r-transparent motion-safe:animate-spin" />
          </div>
          <h1 className="text-xl font-semibold">Creating your tailored resume…</h1>
        </CardContent>
      </Card>
      {children}
    </div>
  );
}
