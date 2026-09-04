/**
 * In-memory inverted index wrapping CanonicalJobCatalog for keyword search.
 *
 * Production path (future): Postgres full-text search (tsvector / GIN) or OpenSearch.
 * This module is intentionally simple for memory-mode vertical slice.
 */

import type { CanonicalJobCatalog } from "./catalog";
import type { CanonicalJob, JobSearchQuery, JobSearchResult } from "./types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export class RadarSearchIndex {
  /** term -> set of canonical job ids */
  private inverted = new Map<string, Set<string>>();
  private documents = new Map<string, CanonicalJob>();
  lastReindexAt: string | null = null;

  constructor(private readonly catalog: CanonicalJobCatalog) {}

  reindexAll(): void {
    this.inverted.clear();
    this.documents.clear();
    for (const job of this.catalog.canonicalJobs.values()) {
      this.indexJob(job);
    }
    this.lastReindexAt = new Date().toISOString();
    this.catalog.indexedAt = this.lastReindexAt;
  }

  indexJob(job: CanonicalJob): void {
    this.documents.set(job.id, job);
    const terms = new Set(
      tokenize(
        [
          job.title,
          job.companyName,
          job.description,
          job.department ?? "",
          job.team ?? "",
          ...job.techStack,
          ...job.locations,
        ].join(" "),
      ),
    );
    for (const term of terms) {
      let set = this.inverted.get(term);
      if (!set) {
        set = new Set();
        this.inverted.set(term, set);
      }
      set.add(job.id);
    }
  }

  /** Keyword prefilter; delegates full filter/sort/pagination to catalog.search. */
  search(query: JobSearchQuery, opts?: Parameters<CanonicalJobCatalog["search"]>[1]): JobSearchResult {
    return this.catalog.search(query, opts);
  }

  stats() {
    return {
      terms: this.inverted.size,
      documents: this.documents.size,
      lastReindexAt: this.lastReindexAt,
      /** Future: Postgres FTS / OpenSearch */
      productionPath: "postgres_fts_or_opensearch" as const,
    };
  }
}
