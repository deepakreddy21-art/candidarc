/**
 * Server-authoritative post-authentication destination.
 * Onboarding completion is defined only by candidateProfiles.onboardingCompletedAt.
 */
import type { Repositories } from "../database/repositories";
import { sanitizeReturnPath } from "./google-oauth";

export type PostAuthDestinationReason =
  | "new_or_missing_profile"
  | "onboarding_incomplete"
  | "onboarding_complete";

export type PostAuthDestination = {
  path: string;
  reason: PostAuthDestinationReason;
};

/**
 * Decide where an authenticated user should land after login/OAuth.
 * Preferred return paths apply only after onboarding is complete.
 */
export async function resolvePostAuthDestination(
  repos: Repositories,
  input: {
    userId: string;
    tenantId: string;
    preferredReturnPath?: string | null;
  },
): Promise<PostAuthDestination> {
  const profile = await repos.candidateProfiles.getByUser(input.tenantId, input.userId);
  if (!profile || profile.onboardingCompletedAt == null) {
    return {
      path: "/onboarding",
      reason: !profile ? "new_or_missing_profile" : "onboarding_incomplete",
    };
  }
  return {
    path: sanitizeReturnPath(input.preferredReturnPath, "/app"),
    reason: "onboarding_complete",
  };
}
