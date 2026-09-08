import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { resolveAppGate } from "@server/auth/app-gate";

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  // Compute the gate result first. Never call redirect() inside a try/catch that
  // could swallow Next.js's redirect control-flow exception.
  const gate = await resolveAppGate();

  if (gate.outcome === "redirect") {
    const path = gate.path === "/sign-in" ? "/sign-in?next=/app" : gate.path;
    redirect(path);
  }

  if (gate.outcome === "unavailable") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-canvas px-4 text-center">
        <h1 className="font-serif text-2xl text-foreground">Temporarily unavailable</h1>
        <p className="max-w-md text-sm text-foreground-secondary">{gate.message}</p>
        <a className="text-sm text-accent underline-offset-4 hover:underline" href="/sign-in">
          Sign in again
        </a>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
