/* shared with extension popup/content — exported for loaders that import this module */
export const FIELD_CONFIDENCE = Object.freeze({
  VERIFIED: "VERIFIED",
  HIGH_CONFIDENCE: "HIGH_CONFIDENCE",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  SENSITIVE: "SENSITIVE",
  UNSUPPORTED: "UNSUPPORTED",
  BLOCKED: "BLOCKED",
});

export const APPLICATION_MODES = Object.freeze({
  PREPARE_ONLY: "prepare_only",
  AUTOFILL_REVIEW: "autofill_review",
  AUTHORIZED_SUBMISSION: "authorized_submission",
});

// Also attach for classic script tags without modules
if (typeof globalThis !== "undefined") {
  globalThis.CandidArcContracts = { FIELD_CONFIDENCE, APPLICATION_MODES };
}
