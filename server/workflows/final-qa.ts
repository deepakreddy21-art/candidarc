export type FinalQaCheck = {
  code: FinalQaCheckCode;
  label: string;
  status: "pass" | "fail" | "warning";
  detail: string;
  blocking: boolean;
};

export type FinalQaCheckCode =
  | "PRIMARY_TECHNOLOGY_EMPHASIS"
  | "HAS_SUMMARY"
  | "HAS_SKILLS"
  | "HAS_EXPERIENCE"
  | "DUPLICATE_BULLETS"
  | "REQUIRED_SECTIONS"
  | "ATS_FORMAT"
  | "LENGTH_REDUCE"
  | "UNSUPPORTED_CLAIM"
  | "EVIDENCE_LINKED"
  | "TECHNOLOGY_CLAIMS"
  | "SCORE_RUBRIC_PRESENT"
  | "SECTION_COUNT"
  | "CRITICAL_FINDINGS"
  | "EVIDENCE_REFERENCES"
  | "EDUCATION"
  | "CONTACT_INFORMATION"
  | "CHRONOLOGY"
  | "PAGE_LENGTH"
  | "UNKNOWN";

export const FINAL_QA_CHECK_REGISTRY: Readonly<
  Record<FinalQaCheckCode, { blocking: boolean; repairable: boolean; required: boolean }>
> = Object.freeze({
  PRIMARY_TECHNOLOGY_EMPHASIS: { blocking: true, repairable: true, required: true },
  HAS_SUMMARY: { blocking: true, repairable: true, required: true },
  HAS_SKILLS: { blocking: false, repairable: true, required: false },
  HAS_EXPERIENCE: { blocking: true, repairable: false, required: true },
  DUPLICATE_BULLETS: { blocking: true, repairable: true, required: true },
  REQUIRED_SECTIONS: { blocking: true, repairable: false, required: true },
  ATS_FORMAT: { blocking: true, repairable: true, required: false },
  LENGTH_REDUCE: { blocking: true, repairable: true, required: false },
  UNSUPPORTED_CLAIM: { blocking: true, repairable: true, required: false },
  EVIDENCE_LINKED: { blocking: true, repairable: false, required: true },
  TECHNOLOGY_CLAIMS: { blocking: true, repairable: true, required: true },
  SCORE_RUBRIC_PRESENT: { blocking: true, repairable: false, required: true },
  SECTION_COUNT: { blocking: false, repairable: false, required: false },
  CRITICAL_FINDINGS: { blocking: true, repairable: false, required: true },
  EVIDENCE_REFERENCES: { blocking: true, repairable: false, required: true },
  EDUCATION: { blocking: false, repairable: false, required: false },
  CONTACT_INFORMATION: { blocking: false, repairable: false, required: false },
  CHRONOLOGY: { blocking: false, repairable: false, required: false },
  PAGE_LENGTH: { blocking: false, repairable: false, required: false },
  UNKNOWN: { blocking: false, repairable: false, required: false },
});

export function validateAuthorizedFinalQaResult<T extends { code: string; status: string; blocking: boolean }>(input: {
  passed: boolean;
  checks: T[];
}): { valid: boolean; blockingFailures: T[] } {
  const codes = input.checks.map((check) => check.code);
  const requiredCodes = Object.entries(FINAL_QA_CHECK_REGISTRY)
    .filter(([, definition]) => definition.required)
    .map(([code]) => code);
  const allowedStatuses = new Set(["pass", "warn", "warning", "fail"]);
  const valid =
    input.checks.length > 0 &&
    new Set(codes).size === codes.length &&
    requiredCodes.every((code) => codes.includes(code)) &&
    input.checks.every((check) => {
      const definition = FINAL_QA_CHECK_REGISTRY[check.code as FinalQaCheckCode];
      if (!definition) {
        return !(check.blocking && check.status === "fail");
      }
      if (!allowedStatuses.has(check.status)) return false;
      return check.blocking === definition.blocking;
    });
  const blockingFailures = input.checks.filter((check) => {
    const definition = FINAL_QA_CHECK_REGISTRY[check.code as FinalQaCheckCode];
    return Boolean(definition?.blocking) && check.status === "fail";
  });
  return {
    valid: valid && (!input.passed || blockingFailures.length === 0),
    blockingFailures,
  };
}

const TECH_LIKE =
  /\b(kubernetes|k8s|terraform|aws|gcp|azure|react|python|java|golang|typescript|kafka|spark|docker|helm|graphql)\b/gi;

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textOf).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(textOf).join(" ");
  return "";
}

function unsupportedTechnologiesInText(text: string, allowed: Set<string>): string[] {
  const unsupported: string[] = [];
  for (const match of text.matchAll(TECH_LIKE)) {
    const token = match[0].toLowerCase();
    if (!allowed.has(token)) unsupported.push(match[0]);
  }
  return [...new Set(unsupported)];
}

export function runDeterministicFinalQa(input: {
  sections: unknown[];
  unresolvedCriticalFindings?: number;
  knownEvidenceIds?: string[];
  knownTechnologies?: string[];
  attestedTechnologies?: string[];
}): { passed: boolean; checks: FinalQaCheck[]; wordCount: number; estimatedPages: number } {
  const text = textOf(input.sections).replace(/\s+/g, " ").trim();
  const words = text ? text.split(" ").length : 0;
  const estimatedPages = Math.max(1, Math.ceil(words / 550));
  const lines = textOf(input.sections)
    .split(/\n|•/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalized = lines.map((line) => line.toLowerCase().replace(/\W/g, ""));
  const duplicates = normalized.filter((line, index) => normalized.indexOf(line) !== index);
  const evidenceRefs = [...text.matchAll(/\b(?:ev|evp)[-_][a-z0-9]+\b/gi)].map((match) => match[0]);
  const knownEvidence = new Set(input.knownEvidenceIds ?? []);
  const unknownEvidence = evidenceRefs.filter((id) => !knownEvidence.has(id));
  const allowedTech = new Set([
    ...(input.knownTechnologies ?? []).map((t) => t.toLowerCase()),
    ...(input.attestedTechnologies ?? []).map((t) => t.toLowerCase()),
  ]);
  const unsupportedTech = unsupportedTechnologiesInText(text, allowedTech);
  const hasContact = /@|linkedin\.com|github\.com|\+?\d[\d\s().-]{7,}/i.test(text);
  const hasExperience =
    input.sections.some(
      (section) => typeof section === "object" && section && (section as { type?: string }).type === "experience",
    ) || /experience/i.test(text);
  const hasEducation =
    input.sections.some(
      (section) => typeof section === "object" && section && (section as { type?: string }).type === "education",
    ) || /education/i.test(text);
  const chronologyDates = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((match) => Number(match[0]));
  const chronologyValid = chronologyDates.every((year, index) => index === 0 || year <= chronologyDates[index - 1]!);

  const checks: FinalQaCheck[] = [
    {
      code: "REQUIRED_SECTIONS",
      label: "Required sections",
      status: hasExperience ? "pass" : "fail",
      detail: hasExperience
        ? hasEducation
          ? "Experience and education sections are present."
          : "Experience present; education omitted because no education evidence was supplied."
        : "Experience section is required.",
      blocking: true,
    },
    {
      code: "EDUCATION",
      label: "Education",
      status: hasEducation ? "pass" : "warning",
      detail: hasEducation
        ? "Education section present."
        : "No education section — add attested education evidence to include it.",
      blocking: false,
    },
    {
      code: "DUPLICATE_BULLETS",
      label: "Duplicate bullets",
      status: duplicates.length ? "fail" : "pass",
      detail: duplicates.length ? `${duplicates.length} duplicate entries found.` : "No duplicate bullets found.",
      blocking: true,
    },
    {
      code: "CONTACT_INFORMATION",
      label: "Contact information",
      status: hasContact ? "pass" : "warning",
      detail: hasContact ? "Contact information detected." : "No contact information detected.",
      blocking: false,
    },
    {
      code: "CRITICAL_FINDINGS",
      label: "Critical findings",
      status: input.unresolvedCriticalFindings ? "fail" : "pass",
      detail: `${input.unresolvedCriticalFindings ?? 0} unresolved critical findings.`,
      blocking: true,
    },
    {
      code: "EVIDENCE_REFERENCES",
      label: "Evidence references",
      status: unknownEvidence.length ? "fail" : "pass",
      detail: unknownEvidence.length
        ? `Unknown evidence: ${unknownEvidence.join(", ")}`
        : "Evidence references are valid.",
      blocking: true,
    },
    {
      code: "TECHNOLOGY_CLAIMS",
      label: "Technology claims",
      status: unsupportedTech.length ? "fail" : "pass",
      detail: unsupportedTech.length
        ? `Unsupported technologies in visible text: ${unsupportedTech.join(", ")}`
        : "Technologies match evidence or attestation.",
      blocking: true,
    },
    {
      code: "CHRONOLOGY",
      label: "Chronology",
      status: chronologyValid ? "pass" : "warning",
      detail: chronologyValid ? "Chronology is ordered." : "Dates may not be reverse chronological.",
      blocking: false,
    },
    {
      code: "PAGE_LENGTH",
      label: "Page estimate",
      status: estimatedPages <= 2 ? "pass" : "warning",
      detail: `${words} words, approximately ${estimatedPages} pages.`,
      blocking: false,
    },
  ];

  return {
    passed: !checks.some((check) => check.blocking && check.status === "fail"),
    checks,
    wordCount: words,
    estimatedPages,
  };
}
