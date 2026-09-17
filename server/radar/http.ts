import { z } from "zod";
import type { JobSearchQuery } from "./types";

const UI_SORT_TO_BACKEND: Record<string, "freshness" | "match" | "discovered" | "original" | "company" | "title"> = {
  best_match: "match",
  genuinely_newest: "original",
  recently_discovered: "discovered",
  recently_reposted: "original",
  recently_verified: "discovered",
  highest_compensation: "match",
  company_direct_first: "company",
  freshness: "freshness",
  match: "match",
  discovered: "discovered",
  original: "original",
  company: "company",
  title: "title",
};

export const jobSearchQuerySchema = z.object({
  keywords: z.string().optional(),
  company: z.string().optional(),
  location: z.string().optional(),
  remote: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
  remotePolicy: z.enum(["remote", "hybrid", "onsite", "unknown"]).optional(),
  savedOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
  employmentType: z.string().optional(),
  seniority: z.string().optional(),
  sponsorship: z.enum(["stated", "historical", "not_offered", "unknown"]).optional(),
  freshnessPreset: z.string().optional(),
  freshnessCustomStart: z.string().optional(),
  freshnessCustomEnd: z.string().optional(),
  freshnessBasis: z
    .enum(["originally_posted", "source_posted", "reposted", "discovered", "last_verified"])
    .optional(),
  freshnessType: z
    .enum(["genuinely_new", "new_or_reposted", "reposted_only", "refreshed", "reopened"])
    .optional(),
  excludeOriginalOlderThanDays: z.coerce.number().int().positive().optional(),
  maxRepostCount: z.coerce.number().int().min(0).optional(),
  requireKnownOriginalDate: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
  companyDirectOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
  verifiedOpenOnly: z
    .union([z.boolean(), z.enum(["true", "false", "1", "0"])])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true" || v === "1";
    }),
  matchScoreMin: z.coerce.number().min(0).max(100).optional(),
  timezone: z.string().optional(),
  sort: z.preprocess((value) => {
    if (typeof value !== "string" || !value) return undefined;
    return UI_SORT_TO_BACKEND[value] ?? value;
  }, z.enum(["freshness", "match", "discovered", "original", "company", "title"]).optional()),
  sortDir: z.enum(["asc", "desc"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Accept Radar UI search payloads (q, tab, best_match sort) on saved-search and alert POSTs. */
export function coerceJobSearchQueryInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const o = { ...(value as Record<string, unknown>) };
  if (typeof o.q === "string" && o.keywords == null) o.keywords = o.q;
  if (
    o.remotePolicy == null &&
    (o.arrangement === "remote" || o.arrangement === "hybrid" || o.arrangement === "onsite")
  ) {
    o.remotePolicy = o.arrangement;
  }
  if (o.remotePolicy === "any" || o.remotePolicy === "unspecified") delete o.remotePolicy;
  if (o.freshnessType === "any") delete o.freshnessType;
  if (typeof o.customStart === "string" && o.freshnessCustomStart == null) o.freshnessCustomStart = o.customStart;
  if (typeof o.customEnd === "string" && o.freshnessCustomEnd == null) o.freshnessCustomEnd = o.customEnd;
  if (typeof o.sort === "string") {
    const mapped = UI_SORT_TO_BACKEND[o.sort];
    if (mapped) o.sort = mapped;
    else delete o.sort;
  }
  for (const key of [
    "q",
    "tab",
    "arrangement",
    "includeReposts",
    "hidePossibleDuplicates",
    "compensationMin",
    "excludedCompanies",
    "excludeCompanies",
    "customStart",
    "customEnd",
    "savedOnly",
  ]) {
    delete o[key];
  }
  return o;
}

const jobSearchQueryFromUi = z.preprocess((value) => coerceJobSearchQueryInput(value ?? {}), jobSearchQuerySchema);

export function parseJobSearchParams(url: URL): JobSearchQuery {
  const raw: Record<string, string> = {};
  // UI aliases → backend fields
  const aliases: Record<string, string> = {
    q: "keywords",
    customStart: "freshnessCustomStart",
    customEnd: "freshnessCustomEnd",
  };
  for (const key of [
    "keywords",
    "q",
    "company",
    "location",
    "remote",
    "remotePolicy",
    "savedOnly",
    "employmentType",
    "seniority",
    "sponsorship",
    "freshnessPreset",
    "freshnessCustomStart",
    "freshnessCustomEnd",
    "customStart",
    "customEnd",
    "freshnessBasis",
    "freshnessType",
    "excludeOriginalOlderThanDays",
    "maxRepostCount",
    "requireKnownOriginalDate",
    "companyDirectOnly",
    "verifiedOpenOnly",
    "matchScoreMin",
    "timezone",
    "sort",
    "sortDir",
    "cursor",
    "limit",
  ]) {
    const v = url.searchParams.get(key);
    if (v === null) continue;
    const dest = aliases[key] ?? key;
    raw[dest] = v;
  }

  // Map UI sort enums to backend sort fields
  if (raw.sort) {
    const sortMap: Record<string, string> = {
      best_match: "match",
      genuinely_newest: "original",
      recently_discovered: "discovered",
      recently_reposted: "freshness",
      recently_verified: "freshness",
      highest_compensation: "match",
      company_direct_first: "company",
    };
    raw.sort = sortMap[raw.sort] ?? raw.sort;
  }

  if (raw.freshnessBasis === undefined && raw.sort === "freshness") {
    // keep default
  }
  if (url.searchParams.get("freshnessBasis") === null) {
    const sort = url.searchParams.get("sort");
    if (sort === "recently_reposted") raw.freshnessBasis = "reposted";
    if (sort === "recently_verified") raw.freshnessBasis = "last_verified";
    if (sort === "genuinely_newest") raw.freshnessBasis = "originally_posted";
    if (sort === "recently_discovered") raw.freshnessBasis = "discovered";
  }

  // remote policy: UI may send remote|hybrid|onsite|any as `remote`
  if (raw.remote === "any" || raw.remote === "unspecified") {
    delete raw.remote;
  } else if (raw.remote === "remote" || raw.remote === "hybrid" || raw.remote === "onsite") {
    raw.remotePolicy = raw.remote;
    delete raw.remote;
  }

  if (raw.freshnessType === "any") delete raw.freshnessType;
  if (raw.freshnessPreset === "custom") delete raw.freshnessPreset;

  return jobSearchQuerySchema.parse(raw) as JobSearchQuery;
}

export const savedSearchBodySchema = z.object({
  name: z.string().min(1).max(120),
  query: jobSearchQueryFromUi,
  alertEnabled: z.boolean().optional(),
});

export const savedSearchPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  query: jobSearchQuerySchema.optional(),
  alertEnabled: z.boolean().optional(),
});

const alertCadenceSchema = z
  .enum([
    "immediate",
    "hourly",
    "daily",
    "weekly",
    "paused",
    "near_realtime",
    "every_15m",
    "every_3h",
  ])
  .optional()
  .transform((v) => {
    if (!v) return undefined;
    const map: Record<string, "immediate" | "hourly" | "daily" | "weekly" | "paused"> = {
      near_realtime: "immediate",
      every_15m: "immediate",
      every_3h: "hourly",
      immediate: "immediate",
      hourly: "hourly",
      daily: "daily",
      weekly: "weekly",
      paused: "paused",
    };
    return map[v] ?? "immediate";
  });

export const jobAlertBodySchema = z.object({
  name: z.string().min(1).max(120),
  query: jobSearchQueryFromUi,
  cadence: alertCadenceSchema,
  channels: z.array(z.enum(["in_app", "email", "push"])).optional(),
  active: z.boolean().optional(),
  includeReposts: z.boolean().optional(),
  includeRefreshes: z.boolean().optional(),
  savedSearchId: z.string().optional(),
});

export const jobAlertPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  query: jobSearchQuerySchema.optional(),
  cadence: alertCadenceSchema,
  enabled: z.boolean().optional(),
  active: z.boolean().optional(),
  includeReposts: z.boolean().optional(),
  includeRefreshes: z.boolean().optional(),
});

export const createApplicationFromJobBodySchema = z.object({
  sightingId: z.string().optional(),
});
