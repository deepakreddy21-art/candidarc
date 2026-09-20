/** Physical measurements from the approved Letter résumé reference (points). */
export const RESUME_TEMPLATE = {
  name: "CandidArc Classic v1",
  id: "candidarc-classic-v1",
  fontFamily: "Liberation Serif",
  page: { width: 612, height: 792, top: 36.5, bottom: 36, left: 44.64, right: 44.64 },
  nameSize: 19.925,
  contactSize: 10.162,
  headingSize: 11.158,
  bodySize: 10.262,
  leading: 11.756,
  bulletGap: 3.139,
  bulletIndent: 13.054,
  sectionGap: 9,
  headingGap: 5,
  entryGap: 7,
  rule: 0.548,
  summaryIndent: 15.12,
  nameGap: 0,
  sectionOrder: ["summary", "experience", "projects", "skills", "education", "certifications", "publications", "other"],
} as const;

export const RESUME_FONT_FACES = [
  { file: "LiberationSerif-Regular.ttf", weight: 400, style: "normal", embed: "embedRegular" },
  { file: "LiberationSerif-Bold.ttf", weight: 700, style: "normal", embed: "embedBold" },
  { file: "LiberationSerif-Italic.ttf", weight: 400, style: "italic", embed: "embedItalic" },
  { file: "LiberationSerif-BoldItalic.ttf", weight: 700, style: "italic", embed: "embedBoldItalic" },
] as const;

/** Preserve the displayed value; only well-formed web URLs become active links. */
export function resumeLink(value: string): string | undefined {
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    return ["http:", "https:"].includes(url.protocol) && url.hostname.includes(".") ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function resumeContactLinks(contact: { linkedIn?: string; github?: string; portfolio?: string }) {
  return [
    { label: "LinkedIn", value: contact.linkedIn },
    { label: "GitHub", value: contact.github },
    { label: "Portfolio", value: contact.portfolio },
  ].filter((link): link is { label: string; value: string } => Boolean(link.value));
}
