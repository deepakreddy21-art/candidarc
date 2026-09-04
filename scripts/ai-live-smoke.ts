import { z } from "zod";
import { getGenerationProvider } from "../server/ai";

if (process.env.RUN_LIVE_AI_SMOKE !== "1" || process.env.AI_MODE !== "live") {
  console.log("Skipped: set AI_MODE=live and RUN_LIVE_AI_SMOKE=1.");
  process.exit(0);
}

const selected = process.env.AI_GENERATION_PROVIDER ?? "openai";
const configuredProviders = [
  selected,
  process.env.AI_HR_AUDIT_PROVIDER ?? "anthropic",
  process.env.AI_EM_AUDIT_PROVIDER ?? "anthropic",
  process.env.AI_FINAL_REVIEW_PROVIDER ?? "openai",
];
const missing = [
  ...(configuredProviders.includes("openai") && !process.env.OPENAI_API_KEY ? ["OPENAI_API_KEY"] : []),
  ...(configuredProviders.includes("anthropic") && !process.env.ANTHROPIC_API_KEY ? ["ANTHROPIC_API_KEY"] : []),
];
if (missing.length) {
  console.log(`Skipped: missing ${missing.join(", ")} for selected live providers.`);
  process.exit(0);
}

const provider = getGenerationProvider();
const result = await provider.generateStructured({
  prompt: { id: "live-smoke", version: "1.0.0" },
  system: "Return only valid JSON. This is a minimal connectivity test.",
  user: 'Return {"ok":true}.',
  schema: z.object({ ok: z.literal(true) }),
  model: { provider: provider.name, model: selected === "anthropic"
    ? process.env.ANTHROPIC_AUDIT_MODEL ?? "claude-sonnet-4-20250514"
    : process.env.OPENAI_GENERATION_MODEL ?? "gpt-4o-mini", maxOutputTokens: 32 },
});

console.log(JSON.stringify({
  ok: result.data.ok,
  provider: result.model.provider,
  model: result.model.model,
  tokens: result.usage.inputTokens + result.usage.outputTokens,
}));
