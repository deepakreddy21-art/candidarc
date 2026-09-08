"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  GOOGLE_AUTH_NOT_CONFIGURED: "Google sign-in is not available right now.",
  GOOGLE_AUTH_MISCONFIGURED: "Google sign-in is not available right now.",
  GOOGLE_RATE_LIMITED: "Too many sign-in attempts. Please wait a moment and try again.",
  GOOGLE_AUTH_CANCELLED: "Google sign-in was cancelled.",
  GOOGLE_OAUTH_DENIED: "Google sign-in was denied.",
  GOOGLE_TXN_INVALID: "Your Google sign-in session expired. Please try again.",
  GOOGLE_STATE_MISSING: "Google sign-in could not be verified. Please try again.",
  GOOGLE_STATE_MISMATCH: "Google sign-in could not be verified. Please try again.",
  GOOGLE_CODE_MISSING: "Google sign-in could not be completed. Please try again.",
  GOOGLE_PKCE_MISSING: "Google sign-in could not be completed. Please try again.",
  GOOGLE_TOKEN_TIMEOUT: "Google took too long to respond. Please try again.",
  GOOGLE_TOKEN_EXCHANGE_FAILED: "Google sign-in could not be completed. Please try again.",
  GOOGLE_TOKEN_MALFORMED: "Google sign-in could not be completed. Please try again.",
  GOOGLE_ID_TOKEN_INVALID: "Google sign-in could not be verified. Please try again.",
  GOOGLE_ID_TOKEN_EXPIRED: "Google sign-in expired. Please try again.",
  GOOGLE_ID_TOKEN_ISSUER: "Google sign-in could not be verified. Please try again.",
  GOOGLE_NONCE_MISMATCH: "Google sign-in could not be verified. Please try again.",
  GOOGLE_SUB_MISSING: "Google sign-in could not be verified. Please try again.",
  GOOGLE_EMAIL_MISSING: "Google did not provide an email address.",
  GOOGLE_EMAIL_UNVERIFIED: "Your Google email must be verified before continuing.",
  GOOGLE_ACCOUNT_LINK_REQUIRED:
    "An account with this email already exists. Sign in with your email and password instead.",
  GOOGLE_ACCOUNT_DISABLED: "This account is no longer available.",
  GOOGLE_AUTH_FAILED: "Google sign-in failed. Please try again.",
};

export function googleErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return GOOGLE_ERROR_MESSAGES[code] ?? "Google sign-in failed. Please try again.";
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.2 14.7 2.2 12 2.2 6.9 2.2 2.8 6.3 2.8 11.4S6.9 20.6 12 20.6c6.1 0 8.5-4.3 8.5-6.5 0-.4 0-.7-.1-1H12z"
      />
      <path fill="#34A853" d="M3.9 7.4l3.2 2.4C8 7.6 9.8 6.4 12 6.4c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.9 3.2 14.7 2.2 12 2.2 8.3 2.2 5.1 4.3 3.9 7.4z" />
      <path fill="#4A90E2" d="M12 20.6c2.6 0 4.8-.9 6.4-2.4l-3.1-2.4c-.9.6-2 1-3.3 1-3.1 0-5.7-2-6.6-4.8l-3.2 2.5C4 18.4 7.7 20.6 12 20.6z" />
      <path fill="#FBBC05" d="M5.4 12c0-.7.1-1.3.3-1.9L2.5 7.6C1.9 8.9 1.6 10.4 1.6 12s.3 3.1.9 4.4l3.2-2.5c-.2-.6-.3-1.2-.3-1.9z" />
    </svg>
  );
}

export function GoogleAuthButton({
  nextPath = "/app",
  label = "Continue with Google",
}: {
  nextPath?: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);
  const href = useMemo(() => {
    const params = new URLSearchParams({ next: nextPath });
    return `/api/v1/auth/google/start?${params.toString()}`;
  }, [nextPath]);

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full gap-2"
      disabled={loading}
      aria-label={label}
      aria-busy={loading}
      onClick={() => {
        if (loading) return;
        setLoading(true);
        window.location.assign(href);
      }}
    >
      <GoogleGlyph className="size-4 shrink-0" />
      {loading ? "Redirecting to Google…" : label}
    </Button>
  );
}

export function GoogleAuthErrorBanner() {
  const params = useSearchParams();
  const message = googleErrorMessage(params.get("google_error"));
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  );
}

export function AuthDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="relative my-5" role="separator" aria-label={label}>
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-border" />
      </div>
      <div className="relative flex justify-center text-xs uppercase tracking-wide">
        <span className="bg-card px-2 text-foreground-secondary">{label}</span>
      </div>
    </div>
  );
}
