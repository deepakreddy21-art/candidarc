"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { buttonVariants } from "@/components/ui/button";
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
            Your profile is saved. See roles matched to your direction, then tailor a resume when you find one worth
            applying to.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Link href="/app/radar" className={cn(buttonVariants(), "w-full")}>
            See jobs for you
          </Link>
          <Link href="/app/settings/profile" className={cn(buttonVariants({ variant: "secondary" }), "w-full")}>
            Review career profile
          </Link>
        </div>
      </div>
    </div>
  );
}
