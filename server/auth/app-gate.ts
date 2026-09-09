import { headers } from "next/headers";
import { getRuntime } from "../bootstrap";
import { buildAuthContext } from "../http/context";
import { parseSessionCookie, SESSION_COOKIE_NAME } from "./session";

export type AppGateResult =
  | { outcome: "allow" }
  | { outcome: "redirect"; path: string }
  | { outcome: "unavailable"; message: string };

/**
 * Authoritative gate for /app routes.
 * Cookie presence alone is not authentication — session must verify and profile must be complete.
 * Uses the same session resolution path as API routes (buildAuthContext).
 *
 * Next.js dynamic APIs (`headers()`) are read OUTSIDE the application try/catch so
 * framework control-flow / dynamic-rendering bailouts are never swallowed.
 */
export async function resolveAppGate(sessionToken?: string | null): Promise<AppGateResult> {
  let cookieHeader: string;
  if (sessionToken === undefined) {
    // Must not live inside try/catch — Next uses throw for dynamic-server bailouts.
    cookieHeader = (await headers()).get("cookie") ?? "";
  } else if (!sessionToken) {
    cookieHeader = "";
  } else {
    cookieHeader = `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  }

  try {
    if (sessionToken === undefined && !parseSessionCookie(cookieHeader)) {
      return { outcome: "redirect", path: "/sign-in" };
    }
    if (sessionToken !== undefined && !sessionToken) {
      return { outcome: "redirect", path: "/sign-in" };
    }

    const request = new Request("http://candidarc.internal/app-gate", {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });
    const ctx = await buildAuthContext(request);
    if (!ctx.user || !ctx.activeTenantId) {
      return { outcome: "redirect", path: "/sign-in" };
    }

    const runtime = await getRuntime();
    const profile = await runtime.repos.candidateProfiles.getByUser(ctx.activeTenantId, ctx.user.id);
    if (!profile || profile.onboardingCompletedAt == null) {
      return { outcome: "redirect", path: "/onboarding" };
    }

    return { outcome: "allow" };
  } catch (err) {
    // Only genuine session/repo/infra failures. Never catch redirect/notFound/dynamic bailouts here.
    console.error("resolveAppGate failed", err);
    return {
      outcome: "unavailable",
      message: "We could not verify your session. Please try again in a moment.",
    };
  }
}
