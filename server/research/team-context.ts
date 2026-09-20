import { createHash } from "crypto";

export const TEAM_RESEARCH_VERSION = "team-research-v1";

export type TeamContext = { team?: string; product?: string; businessUnit?: string };

/** Extract named teams from explicit JD text; never guess a division from the company. */
export function extractTeamContext(text: string, supplied: TeamContext = {}): TeamContext {
  const read = (labels: string) => {
    const value = text.match(new RegExp(`^(?:${labels})\\s*:\\s*([^\\r\\n]{2,160})$`, "im"))?.[1]?.trim();
    return value && !/[<>]/.test(value) ? value : undefined;
  };
  const namedTeam = text.match(/^(?:about|join|meet) (?:our|the) ([\p{L}\d][\p{L}\d &()/.-]{1,100}) team[.:!]?$/imu)?.[1]?.trim()
    ?? text.match(/\bjoin (?:our|the) ([A-Z][\p{L}\d&()/.-]*(?: [A-Z][\p{L}\d&()/.-]*){0,7}) team\b/u)?.[1];
  return {
    team: supplied.team?.trim().slice(0, 160) || read("team|department") || namedTeam,
    product: supplied.product?.trim().slice(0, 160) || read("product|service"),
    businessUnit: supplied.businessUnit?.trim().slice(0, 160) || read("business unit|division"),
  };
}

export function researchCacheKey(input: {
  company: string; role: string; jobUrl?: string; jobDescription?: string;
  team?: string; product?: string; businessUnit?: string; researchDepth?: string;
}): string {
  // Include the JD and role: adjacent teams or changed jobs must not reuse an old interpretation.
  return createHash("sha256").update(JSON.stringify([
    TEAM_RESEARCH_VERSION, input.company.toLowerCase().trim(), input.role.toLowerCase().trim(),
    input.team ?? "", input.product ?? "", input.businessUnit ?? "", input.jobUrl ?? "",
    input.jobDescription ?? "", input.researchDepth ?? "deep-team",
  ])).digest("hex");
}
