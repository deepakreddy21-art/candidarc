/**
 * Resolve Google OIDC claims into a CandidArc user + tenant without silent email linking.
 */
import { AppError } from "../domain/types";
import type { Repositories, TenantRecord, UserRecord } from "../database/repositories";
import { GOOGLE_AUTH_PROVIDER, type GoogleIdClaims } from "./google-oauth";
import { logger } from "../observability/logger";

export type GoogleSignInResult = {
  user: UserRecord;
  tenant: TenantRecord;
  created: boolean;
};

export async function resolveGoogleSignIn(
  repos: Repositories,
  claims: GoogleIdClaims,
  correlationId?: string,
): Promise<GoogleSignInResult> {
  const existingIdentity = await repos.authIdentities.findByProviderSubject(
    GOOGLE_AUTH_PROVIDER,
    claims.sub,
  );
  if (existingIdentity) {
    const user = await repos.users.findById(existingIdentity.userId);
    if (!user || user.deletedAt) {
      throw new AppError("GOOGLE_ACCOUNT_DISABLED", "This account is no longer available", 403);
    }
    await repos.authIdentities.touchEmail(existingIdentity.id, claims.email);
    const memberships = await repos.users.listMemberships(user.id);
    const tenant = memberships[0]?.tenant;
    if (!tenant) {
      throw new AppError("GOOGLE_ACCOUNT_MISCONFIGURED", "Account is missing a workspace", 500);
    }
    logger.info(
      { code: "GOOGLE_SIGN_IN_EXISTING", correlationId, userPublicId: user.publicId },
      "Google sign-in existing identity",
    );
    return { user, tenant, created: false };
  }

  const emailOwner = await repos.users.findByEmail(claims.email);
  if (emailOwner) {
    // Concurrent signup for the same Google sub may have just created the email/user.
    // Re-check provider subject before treating this as a password-account collision.
    const racedIdentity = await repos.authIdentities.findByProviderSubject(
      GOOGLE_AUTH_PROVIDER,
      claims.sub,
    );
    if (racedIdentity) {
      const user = await repos.users.findById(racedIdentity.userId);
      if (user && !user.deletedAt) {
        await repos.authIdentities.touchEmail(racedIdentity.id, claims.email);
        const memberships = await repos.users.listMemberships(user.id);
        const tenant = memberships[0]?.tenant;
        if (tenant) {
          logger.info(
            { code: "GOOGLE_SIGN_IN_RACE_RESOLVED", correlationId, userPublicId: user.publicId },
            "Google concurrent create resolved to existing identity after email check",
          );
          return { user, tenant, created: false };
        }
      }
    }
    logger.info(
      { code: "GOOGLE_ACCOUNT_LINK_REQUIRED", correlationId, emailDomain: claims.email.split("@")[1] },
      "Google email matches existing account — link required",
    );
    throw new AppError(
      "GOOGLE_ACCOUNT_LINK_REQUIRED",
      "An account with this email already exists. Sign in with your existing method, then link Google from account settings when available.",
      409,
    );
  }

  try {
    const created = await repos.authIdentities.createUserWithGoogleIdentity({
      provider: GOOGLE_AUTH_PROVIDER,
      providerSubject: claims.sub,
      email: claims.email,
      name: claims.name,
    });
    logger.info(
      { code: "GOOGLE_SIGN_UP", correlationId, userPublicId: created.user.publicId },
      "Google sign-up created user",
    );
    return { ...created, created: true };
  } catch (err) {
    // Concurrent callback won the unique (provider, subject) race — load winner.
    const raced = await repos.authIdentities.findByProviderSubject(GOOGLE_AUTH_PROVIDER, claims.sub);
    if (raced) {
      const user = await repos.users.findById(raced.userId);
      if (!user) throw err;
      const memberships = await repos.users.listMemberships(user.id);
      const tenant = memberships[0]?.tenant;
      if (!tenant) throw err;
      logger.info(
        { code: "GOOGLE_SIGN_IN_RACE_RESOLVED", correlationId, userPublicId: user.publicId },
        "Google concurrent create resolved to existing identity",
      );
      return { user, tenant, created: false };
    }
    throw err;
  }
}
