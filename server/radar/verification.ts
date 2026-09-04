/**
 * CandidArc Radar — Source-backed job verification.
 *
 * Verification only marks a job VERIFIED_OPEN after a real provider re-fetch.
 */

import { getProvider } from "./providers/registry";
import type { JobVerificationResult } from "./providers/types";
import type { CanonicalJobCatalog } from "./catalog";
import type { CanonicalJob, VerificationState } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

export type JobVerificationOutcome = {
  job: CanonicalJob;
  verified: boolean;
  sourceChecked: boolean;
};

async function checkListingAtSource(
  providerId: string,
  input: {
    listingId: string;
    url?: string;
    boardToken?: string;
  },
): Promise<JobVerificationResult | null> {
  const provider = getProvider(providerId);
  if (!provider) return null;

  if (provider.verifyListing) {
    return provider.verifyListing({
      listingId: input.listingId,
      url: input.url,
      boardToken: input.boardToken,
    });
  }

  if (provider.fetchListing) {
    const listing = await provider.fetchListing({
      listingId: input.listingId,
      url: input.url,
      boardToken: input.boardToken,
    });
    return {
      listingId: input.listingId,
      open: listing !== null,
      status: listing ? "open" : "closed",
      checkedAt: nowIso(),
      message: listing ? "Listing re-fetched from source" : "Listing not found at source",
    };
  }

  return null;
}

function applyVerificationState(
  job: CanonicalJob,
  checkedAt: string,
  result: JobVerificationResult,
): VerificationState {
  job.lastVerifiedAt = checkedAt;
  job.lastVerifiedPrecision = "EXACT_TIMESTAMP";
  job.updatedAt = checkedAt;

  if (result.open && result.status === "open") {
    job.verificationState = "VERIFIED_OPEN";
    job.status = "open";
    job.closedAt = null;
    return "VERIFIED_OPEN";
  }

  if (result.status === "closed") {
    job.verificationState = "CLOSED";
    job.status = "closed";
    job.closedAt = checkedAt;
    return "CLOSED";
  }

  if (result.status === "error") {
    job.verificationState = "VERIFICATION_FAILED";
    return "VERIFICATION_FAILED";
  }

  job.verificationState = "STALE";
  return "STALE";
}

/**
 * Re-fetch a job listing from its primary source and update verification state.
 */
export async function verifyJobFromSource(
  catalog: CanonicalJobCatalog,
  jobPublicId: string,
): Promise<JobVerificationOutcome | null> {
  const job = catalog.getJob(jobPublicId);
  if (!job) return null;

  const sightings = catalog.getSightingsForJob(job.id);
  const sighting = sightings[0];
  if (!sighting) {
    const checkedAt = nowIso();
    job.verificationState = "STALE";
    job.lastVerifiedAt = checkedAt;
    job.updatedAt = checkedAt;
    catalog.canonicalJobs.set(job.id, job);
    return { job, verified: false, sourceChecked: false };
  }

  const source = catalog.sources.get(sighting.sourceId);
  if (!source) {
    const checkedAt = nowIso();
    job.verificationState = "VERIFICATION_FAILED";
    job.lastVerifiedAt = checkedAt;
    job.updatedAt = checkedAt;
    catalog.canonicalJobs.set(job.id, job);
    return { job, verified: false, sourceChecked: false };
  }

  let result: JobVerificationResult | null;
  try {
    result = await checkListingAtSource(source.providerId, {
      listingId: sighting.sourceListingId,
      url: sighting.sourceUrl,
      boardToken: sighting.sourceCompanyIdentifier,
    });
  } catch {
    const checkedAt = nowIso();
    job.verificationState = "VERIFICATION_FAILED";
    job.lastVerifiedAt = checkedAt;
    job.updatedAt = checkedAt;
    catalog.canonicalJobs.set(job.id, job);
    return { job, verified: false, sourceChecked: true };
  }

  if (!result) {
    const checkedAt = nowIso();
    job.verificationState = "STALE";
    job.lastVerifiedAt = checkedAt;
    job.updatedAt = checkedAt;
    catalog.canonicalJobs.set(job.id, job);
    return { job, verified: false, sourceChecked: false };
  }

  const checkedAt = result.checkedAt || nowIso();
  const state = applyVerificationState(job, checkedAt, result);

  if (state === "VERIFIED_OPEN") {
    sighting.lastVerifiedAt = checkedAt;
    sighting.lastSeenAt = checkedAt;
    sighting.updatedAt = checkedAt;
    catalog.sightings.set(sighting.id, sighting);
    catalog.recordHistory(
      job.id,
      sighting.id,
      "verified",
      result.message ?? "Verified open via source re-fetch",
    );
  } else if (state === "CLOSED") {
    catalog.recordHistory(
      job.id,
      sighting.id,
      "closed",
      result.message ?? "Listing closed at source",
    );
  }

  catalog.canonicalJobs.set(job.id, job);
  return {
    job,
    verified: state === "VERIFIED_OPEN",
    sourceChecked: true,
  };
}
