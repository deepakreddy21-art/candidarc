/**
 * Central product identity. Rename the product by editing this file only.
 * UI copy that needs the brand should import from here — never hardcode the name.
 */
export const product = {
  name: "CandidArc",
  shortName: "CandidArc",
  tagline: "Get noticed for what you can do.",
  description:
    "Find the right roles. Understand the team. Build a resume that brings your strongest experience forward.",
  url: "https://candidarc.app",
  supportEmail: "support@candidarc.app",
} as const;

export type ProductConfig = typeof product;
