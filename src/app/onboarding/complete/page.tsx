"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";

export default function OnboardingCompletePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const progress = await api.getOnboardingProgress();
        if (!progress.completedAt) {
          router.replace("/onboarding");
          return;
        }
        setReady(true);
      } catch {
        router.replace("/sign-in?next=/onboarding/complete");
      }
    })();
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas text-sm text-foreground-muted">
        Finishing setup…
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <Logo className="mx-auto" />
        <div className="space-y-2">
          <h1 className="font-serif text-3xl text-foreground">You&apos;re ready</h1>
          <p className="text-sm text-foreground-secondary">
            Your preferences and career evidence are saved. Next, tailor a resume for a specific job or
            explore roles matched to your direction.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/app/resumes/new" className={cn(buttonVariants(), "w-full")}>
            Tailor my first resume
          </Link>
          <Link href="/app/radar" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
            Explore Job Radar
          </Link>
          <Button type="button" variant="ghost" onClick={() => router.push("/app")}>
            Go to home
          </Button>
        </div>
      </div>
    </div>
  );
}
