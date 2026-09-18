/**
 * Central product identity. Rename the product by editing this file only.
 * UI copy that needs the brand should import from here — never hardcode the name.
 */
export const product = {
  name: "CandidArc",
  shortName: "CandidArc",
  tagline: "Your experience. Their team. A résumé that connects them.",
  description:
    "Discover relevant roles, understand the team behind them, and tailor a résumé around the experience you already have.",
  url: "https://candidarc.app",
  supportEmail: "support@candidarc.app",
} as const;

export type ProductConfig = typeof product;
