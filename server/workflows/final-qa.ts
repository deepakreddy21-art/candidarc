export type FinalQaCheck = {
  label: string;
  status: "pass" | "fail" | "warning";
  detail: string;
  blocking: boolean;
};

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textOf).join(" ");
  return "";
}

export function runDeterministicFinalQa(input: {
  sections: unknown[];
  unresolvedCriticalFindings?: number;
  knownEvidenceIds?: string[];
}): { passed: boolean; checks: FinalQaCheck[]; wordCount: number; estimatedPages: number } {
  const text = textOf(input.sections).replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  const estimatedPages = Math.max(1, Math.ceil(words / 550));
  const lines = textOf(input.sections).split(/\n|•/).map((line) => line.trim()).filter(Boolean);
  const normalized = lines.map((line) => line.toLowerCase().replace(/\W/g, ""));
  const duplicates = normalized.filter((line, index) => normalized.indexOf(line) !== index);
  const evidenceRefs = [...text.matchAll(/\b(?:ev|evidence)[-_][a-z0-9-]+\b/gi)].map((match) => match[0]);
  const unknownEvidence = evidenceRefs.filter((id) => !(input.knownEvidenceIds ?? []).includes(id));
  const hasContact = /@|linkedin\.com|github\.com|\+?\d[\d\s().-]{7,}/i.test(text);
  const hasExperience = /experience/i.test(text);
  const hasEducation = /education/i.test(text);
  const chronologyDates = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  const chronologyValid = chronologyDates.every((year, index) => index === 0 || year <= chronologyDates[index - 1]!);

  const checks: FinalQaCheck[] = [
    { label: "Required sections", status: hasExperience && hasEducation ? "pass" : "fail", detail: "Experience and education sections are required.", blocking: true },
    { label: "Duplicate bullets", status: duplicates.length ? "fail" : "pass", detail: duplicates.length ? `${duplicates.length} duplicate entries found.` : "No duplicate bullets found.", blocking: true },
    { label: "Contact information", status: hasContact ? "pass" : "warning", detail: hasContact ? "Contact information detected." : "No contact information detected.", blocking: false },
    { label: "Critical findings", status: input.unresolvedCriticalFindings ? "fail" : "pass", detail: `${input.unresolvedCriticalFindings ?? 0} unresolved critical findings.`, blocking: true },
    { label: "Evidence references", status: unknownEvidence.length ? "fail" : "pass", detail: unknownEvidence.length ? `Unknown evidence: ${unknownEvidence.join(", ")}` : "Evidence references are valid.", blocking: true },
    { label: "Chronology", status: chronologyValid ? "pass" : "warning", detail: chronologyValid ? "Chronology is ordered." : "Dates may not be reverse chronological.", blocking: false },
    { label: "Page estimate", status: estimatedPages <= 2 ? "pass" : "warning", detail: `${words} words, approximately ${estimatedPages} pages.`, blocking: false },
  ];
  return { passed: !checks.some((check) => check.blocking && check.status === "fail"), checks, wordCount: words, estimatedPages };
}
