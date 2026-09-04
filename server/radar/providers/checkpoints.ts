/**
 * CandidArc Radar — Provider Checkpoints (Release A.7)
 *
 * Tracks ingestion state per provider for incremental fetching.
 * Persists in RadarStore when available.
 */

import type { ProviderCheckpoint, RadarStore } from "../persistence/types";

/**
 * In-memory checkpoint store as fallback.
 */
const memoryCheckpoints = new Map<string, ProviderCheckpoint>();

/**
 * Get checkpoint for a provider.
 */
export async function getCheckpoint(
  providerId: string,
  store?: RadarStore,
): Promise<ProviderCheckpoint | null> {
  if (store?.getCheckpoint) {
    return store.getCheckpoint(providerId);
  }
  return memoryCheckpoints.get(providerId) ?? null;
}

/**
 * Set checkpoint for a provider.
 */
export async function setCheckpoint(
  checkpoint: ProviderCheckpoint,
  store?: RadarStore,
): Promise<void> {
  if (store?.setCheckpoint) {
    await store.setCheckpoint(checkpoint);
  }
  memoryCheckpoints.set(checkpoint.providerId, checkpoint);
}

/**
 * Create a new checkpoint with current timestamp.
 */
export function createCheckpoint(
  providerId: string,
  opts?: Partial<Omit<ProviderCheckpoint, "providerId" | "lastFetchedAt">>,
): ProviderCheckpoint {
  return {
    providerId,
    lastFetchedAt: new Date().toISOString(),
    lastCursor: opts?.lastCursor,
    lastJobCount: opts?.lastJobCount,
    metadata: opts?.metadata,
  };
}

/**
 * Get all checkpoints (for monitoring).
 */
export function getAllCheckpoints(): ProviderCheckpoint[] {
  return [...memoryCheckpoints.values()];
}

/**
 * Clear checkpoint for testing.
 */
export function clearCheckpoint(providerId: string): void {
  memoryCheckpoints.delete(providerId);
}

/**
 * Clear all checkpoints for testing.
 */
export function clearAllCheckpoints(): void {
  memoryCheckpoints.clear();
}
