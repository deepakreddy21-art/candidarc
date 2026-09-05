"""Stable provider / intelligence error codes."""

from __future__ import annotations


class ProviderError(Exception):
    """Typed provider failure with a stable machine-readable code."""

    def __init__(self, code: str, message: str | None = None) -> None:
        self.code = code
        self.message = message or code
        super().__init__(f"{self.code}:{self.message}" if self.message != self.code else self.code)


PROVIDER_TIMEOUT = "PROVIDER_TIMEOUT"
PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
PROVIDER_UNAVAILABLE = "PROVIDER_UNAVAILABLE"
PROVIDER_OUTPUT_INVALID = "PROVIDER_OUTPUT_INVALID"
GUARDRAIL_VIOLATION = "GUARDRAIL_VIOLATION"
MISSING_CREDENTIALS = "MISSING_CREDENTIALS"
MOCK_FORBIDDEN_IN_PRODUCTION = "MOCK_FORBIDDEN_IN_PRODUCTION"
IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED"
CROSS_TENANT_EVIDENCE = "CROSS_TENANT_EVIDENCE"
CROSS_OWNER_EVIDENCE = "CROSS_OWNER_EVIDENCE"
EXPERIMENTAL_DISABLED = "EXPERIMENTAL_DISABLED"
EVIDENCE_STORE_UNAVAILABLE = "EVIDENCE_STORE_UNAVAILABLE"
EVIDENCE_CROSS_TENANT = "EVIDENCE_CROSS_TENANT"
EVIDENCE_NOT_FOUND = "EVIDENCE_NOT_FOUND"


def http_status_for(code: str) -> int:
    if code in {
        MISSING_CREDENTIALS,
        MOCK_FORBIDDEN_IN_PRODUCTION,
        PROVIDER_UNAVAILABLE,
        PROVIDER_TIMEOUT,
        EVIDENCE_STORE_UNAVAILABLE,
    }:
        return 503
    if code == PROVIDER_RATE_LIMITED:
        return 429
    if code in {GUARDRAIL_VIOLATION, PROVIDER_OUTPUT_INVALID}:
        return 422
    if code == IDEMPOTENCY_KEY_REUSED:
        return 409
    if code == EVIDENCE_NOT_FOUND:
        return 404
    if code in {
        CROSS_TENANT_EVIDENCE,
        CROSS_OWNER_EVIDENCE,
        EXPERIMENTAL_DISABLED,
        EVIDENCE_CROSS_TENANT,
    }:
        return 403
    return 500
