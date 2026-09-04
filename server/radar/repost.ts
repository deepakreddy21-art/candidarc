import { createHash } from "crypto";
import type { CanonicalJob, JobClassification, JobSighting } from "./types";

/** Configurable similarity / merge thresholds (exported for tests & tuning). */
export const REPOST_THRESHOLDS = {
  /** Exact requisition / listing / URL match */
  exactMerge: 0.98,
  /** Strong multi-signal merge */
  strongMerge: 0.85,
  /** Likely same role / repost */
  repostMin: 0.72,
  /** Weak title-only → possible duplicate */
  possibleDuplicateMin: 0.45,
  possibleDuplicateMax: 0.71,
  /** Title token Jaccard weight */
  titleWeight: 0.35,
  companyWeight: 0.2,
  requisitionWeight: 0.25,
  listingIdWeight: 0.15,
  descriptionWeight: 0.2,
  teamMismatchPenalty: 0.25,
} as const;

export type SimilaritySignal = {
  name: string;
  weight: number;
  matched: boolean;
  detail?: string;
};

export type SimilarityScore = {
  score: number;
  signals: SimilaritySignal[];
};

export type ClassificationResult = {
  classification: JobClassification;
  confidence: number;
  reasons: string[];
  matchedSightingId?: string;
  mergeRecommended: boolean;
};

export type SightingLike = Pick<
  JobSighting,
  | "sourceListingId"
  | "sourceRequisitionId"
  | "sourceUrl"
  | "sourceTitle"
  | "sourceLocation"
  | "contentHash"
  | "descriptionHash"
  | "classification"
  | "removedAt"
  | "sourceCompanyIdentifier"
> & {
  team?: string;
  department?: string;
  companyNormalized?: string;
};

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\b(sr|snr|senior|jr|junior|ii|iii|iv|staff|principal|lead)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|plc|gmbh)\b\.?/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function descriptionHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

export function contentHash(parts: {
  title: string;
  description: string;
  location?: string;
  requisitionId?: string;
}): string {
  const payload = [
    normalizeTitle(parts.title),
    descriptionHash(parts.description),
    (parts.location ?? "").toLowerCase().trim(),
    (parts.requisitionId ?? "").toLowerCase().trim(),
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function tokenSet(s: string): Set<string> {
  return new Set(
    s
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    u.search = "";
    return u.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

export function scoreSightingSimilarity(a: SightingLike, b: SightingLike): SimilarityScore {
  const signals: SimilaritySignal[] = [];
  let score = 0;
  const T = REPOST_THRESHOLDS;

  const sameListing =
    Boolean(a.sourceListingId) &&
    a.sourceListingId.toLowerCase() === b.sourceListingId.toLowerCase();
  signals.push({
    name: "listing_id",
    weight: T.listingIdWeight,
    matched: sameListing,
    detail: sameListing ? "exact listing id" : undefined,
  });
  if (sameListing) score += T.listingIdWeight;

  const sameReq =
    Boolean(a.sourceRequisitionId) &&
    Boolean(b.sourceRequisitionId) &&
    a.sourceRequisitionId!.toLowerCase() === b.sourceRequisitionId!.toLowerCase();
  signals.push({
    name: "requisition_id",
    weight: T.requisitionWeight,
    matched: sameReq,
    detail: sameReq ? "exact requisition" : undefined,
  });
  if (sameReq) score += T.requisitionWeight;

  const sameUrl =
    Boolean(a.sourceUrl) &&
    Boolean(b.sourceUrl) &&
    normalizeUrl(a.sourceUrl) === normalizeUrl(b.sourceUrl);
  signals.push({
    name: "url",
    weight: 0.2,
    matched: sameUrl,
    detail: sameUrl ? "exact url" : undefined,
  });
  if (sameUrl) score += 0.2;

  const titleSim = jaccard(tokenSet(normalizeTitle(a.sourceTitle)), tokenSet(normalizeTitle(b.sourceTitle)));
  const titleMatched = titleSim >= 0.85;
  signals.push({
    name: "title",
    weight: T.titleWeight,
    matched: titleMatched,
    detail: `jaccard=${titleSim.toFixed(2)}`,
  });
  score += T.titleWeight * titleSim;

  const companyA = a.companyNormalized ?? a.sourceCompanyIdentifier ?? "";
  const companyB = b.companyNormalized ?? b.sourceCompanyIdentifier ?? "";
  const sameCompany =
    Boolean(companyA) &&
    Boolean(companyB) &&
    normalizeCompany(companyA) === normalizeCompany(companyB);
  signals.push({
    name: "company",
    weight: T.companyWeight,
    matched: sameCompany,
  });
  if (sameCompany) score += T.companyWeight;

  const sameDesc =
    Boolean(a.descriptionHash) &&
    a.descriptionHash === b.descriptionHash;
  signals.push({
    name: "description_hash",
    weight: T.descriptionWeight,
    matched: sameDesc,
  });
  if (sameDesc) score += T.descriptionWeight;

  const teamA = (a.team ?? a.department ?? "").toLowerCase().trim();
  const teamB = (b.team ?? b.department ?? "").toLowerCase().trim();
  if (teamA && teamB && teamA !== teamB) {
    score = Math.max(0, score - T.teamMismatchPenalty);
    signals.push({
      name: "team_mismatch",
      weight: -T.teamMismatchPenalty,
      matched: true,
      detail: `${teamA} vs ${teamB}`,
    });
  }

  // Cap at 1.0
  score = Math.min(1, Math.max(0, score));
  return { score, signals };
}

/**
 * Deterministic layered classification of a new sighting against existing catalog state.
 */
export function classifySightingAgainstCanonical(
  sighting: SightingLike,
  existingSightings: SightingLike[],
  priorCanonical?: Pick<
    CanonicalJob,
    "status" | "employerRequisitionId" | "team" | "department" | "classification"
  > & { companyNormalized?: string },
): ClassificationResult {
  const reasons: string[] = [];

  if (existingSightings.length === 0 && !priorCanonical) {
    return {
      classification: "NEW",
      confidence: 0.9,
      reasons: ["No prior sightings for this role"],
      mergeRecommended: false,
    };
  }

  // Exact listing ID with content change → REFRESHED
  const sameListing = existingSightings.find(
    (s) =>
      s.sourceListingId &&
      sighting.sourceListingId &&
      s.sourceListingId.toLowerCase() === sighting.sourceListingId.toLowerCase(),
  );
  if (sameListing) {
    if (
      sameListing.contentHash &&
      sighting.contentHash &&
      sameListing.contentHash !== sighting.contentHash
    ) {
      reasons.push("Same listing ID with content hash change");
      return {
        classification: "REFRESHED",
        confidence: 0.95,
        reasons,
        matchedSightingId: (sameListing as JobSighting).id,
        mergeRecommended: true,
      };
    }
    if (
      sameListing.descriptionHash &&
      sighting.descriptionHash &&
      sameListing.descriptionHash !== sighting.descriptionHash
    ) {
      reasons.push("Same listing ID with description hash change");
      return {
        classification: "REFRESHED",
        confidence: 0.93,
        reasons,
        matchedSightingId: (sameListing as JobSighting).id,
        mergeRecommended: true,
      };
    }
    reasons.push("Same listing ID, unchanged content");
    return {
      classification: "UNCHANGED",
      confidence: 0.97,
      reasons,
      matchedSightingId: (sameListing as JobSighting).id,
      mergeRecommended: true,
    };
  }

  // Same requisition + new listing ID → REPOSTED
  const sameReq = existingSightings.find(
    (s) =>
      s.sourceRequisitionId &&
      sighting.sourceRequisitionId &&
      s.sourceRequisitionId.toLowerCase() === sighting.sourceRequisitionId.toLowerCase() &&
      s.sourceListingId.toLowerCase() !== sighting.sourceListingId.toLowerCase(),
  );
  if (sameReq) {
    // Was closed + same requisition active → REOPENED
    const wasClosed =
      priorCanonical?.status === "closed" ||
      Boolean(sameReq.removedAt) ||
      sameReq.classification === "EXPIRED";
    if (wasClosed) {
      reasons.push("Previously closed requisition is active again");
      return {
        classification: "REOPENED",
        confidence: 0.92,
        reasons,
        matchedSightingId: (sameReq as JobSighting).id,
        mergeRecommended: true,
      };
    }
    reasons.push("Same requisition ID with new listing ID");
    return {
      classification: "REPOSTED",
      confidence: 0.94,
      reasons,
      matchedSightingId: (sameReq as JobSighting).id,
      mergeRecommended: true,
    };
  }

  // Prior canonical closed with matching requisition
  if (
    priorCanonical?.status === "closed" &&
    priorCanonical.employerRequisitionId &&
    sighting.sourceRequisitionId &&
    priorCanonical.employerRequisitionId.toLowerCase() ===
      sighting.sourceRequisitionId.toLowerCase()
  ) {
    reasons.push("Canonical was closed; same requisition active again");
    return {
      classification: "REOPENED",
      confidence: 0.9,
      reasons,
      mergeRecommended: true,
    };
  }

  // Score against best existing sighting
  let best: { sighting: SightingLike; sim: SimilarityScore } | null = null;
  for (const existing of existingSightings) {
    const sim = scoreSightingSimilarity(sighting, existing);
    if (!best || sim.score > best.sim.score) best = { sighting: existing, sim };
  }

  if (!best) {
    return {
      classification: "NEW",
      confidence: 0.85,
      reasons: ["No comparable sightings"],
      mergeRecommended: false,
    };
  }

  const { sim } = best;
  const titleOnly =
    sim.signals.some((s) => s.name === "title" && s.matched) &&
    !sim.signals.some((s) =>
      ["listing_id", "requisition_id", "url", "description_hash"].includes(s.name) && s.matched,
    );

  const teamA = (sighting.team ?? sighting.department ?? priorCanonical?.team ?? "").toLowerCase();
  const teamB = (best.sighting.team ?? best.sighting.department ?? priorCanonical?.team ?? "").toLowerCase();
  const differentTeam = Boolean(teamA && teamB && teamA !== teamB);
  const differentReq =
    Boolean(sighting.sourceRequisitionId) &&
    Boolean(best.sighting.sourceRequisitionId) &&
    sighting.sourceRequisitionId!.toLowerCase() !==
      best.sighting.sourceRequisitionId!.toLowerCase();

  // Same company/title different team+requisition → NEW
  if (
    differentTeam &&
    differentReq &&
    sim.signals.some((s) => s.name === "company" && s.matched) &&
    sim.signals.some((s) => s.name === "title" && s.matched)
  ) {
    reasons.push("Same company and title but different team and requisition");
    return {
      classification: "NEW",
      confidence: 0.88,
      reasons,
      mergeRecommended: false,
    };
  }

  if (sim.score >= REPOST_THRESHOLDS.exactMerge) {
    reasons.push(`Exact merge signals (score=${sim.score.toFixed(2)})`);
    return {
      classification: "DUPLICATE",
      confidence: sim.score,
      reasons,
      matchedSightingId: (best.sighting as JobSighting).id,
      mergeRecommended: true,
    };
  }

  if (sim.score >= REPOST_THRESHOLDS.repostMin) {
    reasons.push(`Strong similarity suggests repost (score=${sim.score.toFixed(2)})`);
    return {
      classification: "REPOSTED",
      confidence: sim.score,
      reasons,
      matchedSightingId: (best.sighting as JobSighting).id,
      mergeRecommended: true,
    };
  }

  if (
    titleOnly &&
    sim.score >= REPOST_THRESHOLDS.possibleDuplicateMin &&
    sim.score <= REPOST_THRESHOLDS.possibleDuplicateMax
  ) {
    reasons.push("Weak title-only similarity");
    return {
      classification: "POSSIBLE_DUPLICATE",
      confidence: sim.score,
      reasons,
      matchedSightingId: (best.sighting as JobSighting).id,
      mergeRecommended: false,
    };
  }

  if (
    sim.score >= REPOST_THRESHOLDS.possibleDuplicateMin &&
    sim.score < REPOST_THRESHOLDS.repostMin
  ) {
    reasons.push(`Ambiguous similarity (score=${sim.score.toFixed(2)})`);
    return {
      classification: "POSSIBLE_DUPLICATE",
      confidence: sim.score,
      reasons,
      matchedSightingId: (best.sighting as JobSighting).id,
      mergeRecommended: false,
    };
  }

  reasons.push("Insufficient similarity to merge");
  return {
    classification: "NEW",
    confidence: 0.8,
    reasons,
    mergeRecommended: false,
  };
}
