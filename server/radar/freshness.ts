import type {
  CanonicalJob,
  FreshnessBasis,
  TimestampPrecision,
} from "./types";

const PRESETS: Record<string, { ms: number; label: string }> = {
  "30m": { ms: 30 * 60_000, label: "Last 30 minutes" },
  "1h": { ms: 60 * 60_000, label: "Last 1 hour" },
  "2h": { ms: 2 * 60 * 60_000, label: "Last 2 hours" },
  "3h": { ms: 3 * 60 * 60_000, label: "Last 3 hours" },
  "6h": { ms: 6 * 60 * 60_000, label: "Last 6 hours" },
  "12h": { ms: 12 * 60 * 60_000, label: "Last 12 hours" },
  "24h": { ms: 24 * 60 * 60_000, label: "Last 24 hours" },
  "48h": { ms: 48 * 60 * 60_000, label: "Last 48 hours" },
  "3d": { ms: 3 * 24 * 60 * 60_000, label: "Last 3 days" },
  "7d": { ms: 7 * 24 * 60 * 60_000, label: "Last 7 days" },
  "14d": { ms: 14 * 24 * 60 * 60_000, label: "Last 14 days" },
  "30d": { ms: 30 * 24 * 60 * 60_000, label: "Last 30 days" },
};

export function parseFreshnessPreset(preset: string): { ms: number; label: string } {
  const key = preset.trim().toLowerCase();
  const found = PRESETS[key];
  if (!found) {
    throw new Error(`Unknown freshness preset: ${preset}`);
  }
  return { ...found };
}

export function listFreshnessPresets(): Array<{ key: string; ms: number; label: string }> {
  return Object.entries(PRESETS).map(([key, v]) => ({ key, ...v }));
}

export function resolveFreshnessTimestamp(
  job: Pick<
    CanonicalJob,
    | "originalPostedAt"
    | "firstDiscoveredAt"
    | "repostedAt"
    | "lastVerifiedAt"
    | "updatedAt"
  > & {
    sourcePostedAt?: string | null;
  },
  basis: FreshnessBasis,
): Date | null {
  const pick = (iso?: string | null): Date | null => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  switch (basis) {
    case "originally_posted":
      return pick(job.originalPostedAt);
    case "source_posted":
      return pick(job.sourcePostedAt ?? job.originalPostedAt);
    case "reposted":
      return pick(job.repostedAt);
    case "discovered":
      return pick(job.firstDiscoveredAt);
    case "last_verified":
      return pick(job.lastVerifiedAt);
    default:
      return null;
  }
}

function startOfLocalDay(d: Date, timeZone?: string): Date {
  if (!timeZone) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    // Approximate local midnight as UTC components labeled by timezone calendar day
    return new Date(Date.UTC(y, m - 1, day));
  } catch {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
}

export function formatFreshnessLabel(
  ts: Date | null | undefined,
  precision: TimestampPrecision,
  now: Date = new Date(),
  basisHint?: FreshnessBasis,
): string {
  const prefix =
    basisHint === "discovered"
      ? "Discovered"
      : basisHint === "reposted"
        ? "Reposted"
        : basisHint === "last_verified"
          ? "Verified open"
          : "Posted";

  if (!ts || Number.isNaN(ts.getTime())) {
    if (precision === "UNKNOWN" || precision === "FIRST_SEEN_ONLY") {
      return basisHint === "discovered"
        ? "Discovered recently"
        : "Original posting date unavailable";
    }
    if (precision === "ESTIMATED") return "Timestamp estimated";
    return "Original posting date unavailable";
  }

  const diffMs = Math.max(0, now.getTime() - ts.getTime());
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);

  if (precision === "DATE_ONLY" || precision === "RELATIVE_DAYS") {
    if (days === 0) return `${prefix} today`;
    if (days === 1) return `${prefix} yesterday`;
    return `${prefix} ${days} days ago`;
  }

  if (precision === "ESTIMATED") {
    if (days >= 1) return `${prefix} ~${days} days ago (estimated)`;
    if (hours >= 1) return `${prefix} ~${hours} hours ago (estimated)`;
    return `${prefix} recently (estimated)`;
  }

  if (precision === "RELATIVE_HOURS") {
    if (hours < 1) return `${prefix} less than an hour ago`;
    if (hours === 1) return `${prefix} about 1 hour ago`;
    return `${prefix} about ${hours} hours ago`;
  }

  // EXACT_TIMESTAMP and FIRST_SEEN_ONLY (when we have a ts)
  if (mins < 1) return `${prefix} just now`;
  if (mins < 60) return `${prefix} ${mins} minute${mins === 1 ? "" : "s"} ago`;
  if (hours < 24) return `${prefix} ${hours} hour${hours === 1 ? "" : "s"} ago`;
  if (days === 1) return `${prefix} 1 day ago`;
  return `${prefix} ${days} days ago`;
}

export type FreshnessFilterOpts = {
  basis: FreshnessBasis;
  preset?: string;
  customStart?: string | Date;
  customEnd?: string | Date;
  timezone?: string;
};

function toDate(v?: string | Date): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function filterByFreshness<
  T extends Pick<
    CanonicalJob,
    | "originalPostedAt"
    | "firstDiscoveredAt"
    | "repostedAt"
    | "lastVerifiedAt"
    | "updatedAt"
    | "originalPostedPrecision"
  > & { sourcePostedAt?: string | null },
>(jobs: T[], opts: FreshnessFilterOpts): T[] {
  const { basis, preset, customStart, customEnd, timezone } = opts;
  const now = new Date();

  let start: Date | null = toDate(customStart);
  let end: Date | null = toDate(customEnd);

  if (preset && !start && !end) {
    const { ms } = parseFreshnessPreset(preset);
    start = new Date(now.getTime() - ms);
    end = now;
  }

  if (!start && !end) return jobs;

  return jobs.filter((job) => {
    const ts = resolveFreshnessTimestamp(job, basis);
    if (!ts) return false;

    // DATE_ONLY: compare by calendar day boundaries, never invent minute precision
    const precision =
      basis === "originally_posted" || basis === "source_posted"
        ? job.originalPostedPrecision
        : "EXACT_TIMESTAMP";

    if (precision === "DATE_ONLY") {
      const day = startOfLocalDay(ts, timezone).getTime();
      if (start && day < startOfLocalDay(start, timezone).getTime()) return false;
      if (end && day > startOfLocalDay(end, timezone).getTime()) return false;
      return true;
    }

    const t = ts.getTime();
    if (start && t < start.getTime()) return false;
    if (end && t > end.getTime()) return false;
    return true;
  });
}

export function excludeOriginallyOlderThan<
  T extends Pick<CanonicalJob, "originalPostedAt">,
>(jobs: T[], maxAgeDays: number, now: Date = new Date()): T[] {
  if (maxAgeDays <= 0) return jobs;
  const cutoff = now.getTime() - maxAgeDays * 86_400_000;
  return jobs.filter((job) => {
    if (!job.originalPostedAt) return true;
    const d = new Date(job.originalPostedAt);
    if (Number.isNaN(d.getTime())) return true;
    return d.getTime() >= cutoff;
  });
}
