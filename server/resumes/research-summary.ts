import { researchSchema, resumePlanItemSchema } from "../ai/schemas";
import type { ResumeResearch } from "../../src/types/resume-research";
import type { ResearchCollection } from "../research/team-collector";

/** Explicit public DTO: never send the saved source excerpts or private evidence IDs. */
export function customerResearchSummary(metadata?: Record<string, unknown>): ResumeResearch | undefined {
  const collection = metadata?.researchCollection as ResearchCollection | undefined;
  if (!collection || !Array.isArray(collection.sources)) return undefined;
  const findings = researchSchema.shape.findings.safeParse(metadata?.researchFindings ?? []);
  const plan = resumePlanItemSchema.array().safeParse(metadata?.resumePlan ?? []);
  const sources = new Map(collection.sources.map((s) => [s.url, s]));
  const refs = metadata?.researchReferences as Array<{ id: string; url: string }> | undefined;
  const byId = new Map((refs ?? []).map((r) => [r.id, sources.get(r.url)]));
  return {
    status: collection.status, notice: collection.notice, collectedAt: collection.collectedAt, cached: collection.cached,
    limitations: Array.isArray(metadata?.researchLimitations)
      ? metadata.researchLimitations.filter((s): s is string => typeof s === "string") : [],
    findings: (findings.success ? findings.data : []).map((f) => ({
      title: f.title, summary: f.summary, scope: f.scope ?? "unknown", status: f.status, caveat: f.caveat,
      sources: f.sourceIds.flatMap((id) => {
        const s = byId.get(id);
        // Job text supplied in demo mode has no external reference to open.
        if (!s || s.type === "job-description" || !/^https?:\/\//i.test(s.url)) return [];
        return [{ title: s.title, url: s.url, publishedAt: s.publishedAt, accessedAt: s.accessedAt }];
      }),
    })),
    plan: (plan.success ? plan.data : []).map((p) => ({
      capability: p.capability, emphasis: p.emphasis, placement: p.placement, gap: p.gap,
    })),
  };
}
