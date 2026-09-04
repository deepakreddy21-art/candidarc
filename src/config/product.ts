/**
 * Central product identity. Rename the product by editing this file only.
 * UI copy that needs the brand should import from here — never hardcode the name.
 */
export const product = {
  name: "CandidArc",
  shortName: "CandidArc",
  tagline: "Fresh opportunities. Verified evidence. Human-approved applications.",
  description:
    "Discover genuinely fresh roles, build every application from verified career evidence, and complete applications accurately with the candidate in control.",
  url: "https://candidarc.app",
  supportEmail: "support@candidarc.app",
} as const;

export type ProductConfig = typeof product;
