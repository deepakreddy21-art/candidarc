import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";

async function requireCompletedOnboarding() {
  const cookieStore = await cookies();
  const session = cookieStore.get("candidarc_session")?.value;
  if (!session) return;

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (!host) return;

  try {
    const res = await fetch(`${proto}://${host}/api/v1/profile/onboarding`, {
      headers: { cookie: cookieStore.toString() },
      cache: "no-store",
    });
    if (!res.ok) return;
    const body = (await res.json()) as { completedAt?: string | null };
    if (!body.completedAt) {
      redirect("/onboarding");
    }
  } catch {
    // If the profile check fails, allow the app shell and let page APIs enforce auth.
  }
}

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  await requireCompletedOnboarding();
  return <AppShell>{children}</AppShell>;
}
