import { z } from "zod";
import { AppError } from "../../domain/types";
import { getEnv } from "../../config/env";
import { htmlToPlainText, ssrfFetch } from "../../security/ssrf-fetch";
import type { BoardFetchInput, JobSourceListing, JobSourceResult, ListingFetchInput } from "./types";

type Provider = "greenhouse" | "lever" | "ashby";
export function shouldFetchLiveBoard(provider: Provider): boolean {
  return getEnv().APP_MODE === "production" || process.env[`${provider.toUpperCase()}_LIVE`] === "1";
}
const rowSchema = z.object({}).catchall(z.unknown());
const string = (value: unknown) => typeof value === "string" ? value : undefined;
const date = (value: unknown) => {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};
const publicUrl = (value: unknown) => {
  try { const url = new URL(String(value)); return ["https:", "http:"].includes(url.protocol) ? url.toString() : undefined; }
  catch { return undefined; }
};

/** Public ATS APIs; no fixtures or success fallback on network/schema failures. */
export async function fetchPublicBoard(provider: Provider, input: BoardFetchInput): Promise<JobSourceResult> {
  const board = input.boardToken?.trim();
  if (!board || !/^[a-zA-Z0-9_-]{1,100}$/.test(board) || board === "demo") {
    throw new AppError("BOARD_REQUIRED", "A real ATS board identifier is required", 400);
  }
  const token = encodeURIComponent(board);
  const urls = {
    greenhouse: `https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`,
    lever: `https://api.lever.co/v0/postings/${token}?mode=json`,
    ashby: `https://api.ashbyhq.com/posting-api/job-board/${token}?includeCompensation=true`,
  };
  const response = await ssrfFetch(urls[provider], { timeoutMs: 12_000, maxBytes: 3_000_000, maxRedirects: 0, headers: { Accept: "application/json" } });
  const body: unknown = JSON.parse(response.body.toString("utf8"));
  const raw = provider === "lever" ? body : (body as { jobs?: unknown })?.jobs;
  const rows = z.array(rowSchema).parse(raw);
  const listings: JobSourceListing[] = [];
  for (const row of rows) {
    if (provider === "ashby" && row.isListed === false) continue;
    const categories = (row.categories ?? {}) as Record<string, unknown>;
    const title = string(row.title) ?? string(row.text);
    const sourceUrl = publicUrl(row.absolute_url ?? row.hostedUrl ?? row.jobUrl);
    const id = typeof row.id === "number" ? String(row.id) : string(row.id) ?? sourceUrl?.split("/").filter(Boolean).at(-1);
    if (!title || !sourceUrl || !id) continue;
    const location = string(row.location) ?? string((row.location as { name?: string } | undefined)?.name) ?? string(categories.location);
    const workplace = string(row.workplaceType)?.toLowerCase();
    const remotePolicy = workplace === "hybrid" ? "hybrid" : workplace === "onsite" ? "onsite" : workplace === "remote" || row.isRemote === true ? "remote" : "unknown";
    const postedAt = date(row.publishedAt ?? row.createdAt);
    const employment = string(row.employmentType) ?? string(categories.commitment);
    const extraLists = Array.isArray(row.lists) ? row.lists.map((entry) => {
      const item = entry as { text?: string; content?: string };
      return `${item.text ?? ""}\n${htmlToPlainText(item.content ?? "")}`;
    }).join("\n") : "";
    const description = [string(row.descriptionPlain) ?? string(row.descriptionPlainText) ?? htmlToPlainText(string(row.content) ?? string(row.descriptionHtml) ?? string(row.description) ?? ""), extraLists].filter(Boolean).join("\n");
    const departments = row.departments as Array<{ name?: string }> | undefined;
    listings.push({
      sourceListingId: id, sourceCompanyIdentifier: board, sourceRequisitionId: string(row.requisition_id),
      title, companyName: input.companyName?.trim() || board, location, locations: location ? [location] : [],
      description, employmentType: employment === "FullTime" ? "Full-time" : employment === "PartTime" ? "Part-time" : employment === "Intern" ? "Internship" : employment,
      department: string(row.department) ?? string(categories.department) ?? departments?.[0]?.name,
      team: string(row.team) ?? string(categories.team), remotePolicy, sourceUrl, applyUrl: publicUrl(row.applyUrl) ?? sourceUrl,
      postedAt: postedAt ?? null, postedPrecision: postedAt ? "EXACT_TIMESTAMP" : "UNKNOWN", updatedAt: date(row.updated_at),
      compensationRaw: string((row.compensation as { scrapeableCompensationSalarySummary?: string } | undefined)?.scrapeableCompensationSalarySummary),
      demoData: false, attribution: `Via ${provider} public job board`,
    });
  }
  // Never silently truncate a board used for open/closed verification.
  if (input.limit != null && listings.length > input.limit) {
    const offset = Number(input.cursor ?? 0);
    if (!Number.isInteger(offset) || offset < 0) throw new AppError("INVALID_CURSOR", "Invalid board cursor", 400);
    const limit = Math.max(1, Math.min(input.limit, 500));
    return { listings: listings.slice(offset, offset + limit), nextCursor: offset + limit < listings.length ? String(offset + limit) : null,
      fetchedAt: new Date().toISOString(), demoData: false, attribution: `Via ${provider} public job board` };
  }
  return { listings, fetchedAt: new Date().toISOString(), demoData: false, attribution: `Via ${provider} public job board` };
}

export async function fetchPublicListing(provider: Provider, input: ListingFetchInput): Promise<JobSourceListing | null> {
  let board = input.boardToken;
  if (!board && input.url) {
    const url = new URL(input.url);
    const hosts = { greenhouse: /(^|\.)greenhouse\.io$/, lever: /(^|\.)lever\.co$/, ashby: /(^|\.)ashbyhq\.com$/ };
    if (hosts[provider].test(url.hostname)) board = url.pathname.split("/").filter(Boolean)[0];
  }
  if (!board) throw new AppError("BOARD_REQUIRED", "Board identifier is required to verify this listing", 400);
  const result = await fetchPublicBoard(provider, { boardToken: board });
  return result.listings.find((row) => row.sourceListingId === input.listingId || (input.url && row.sourceUrl === input.url)) ?? null;
}
