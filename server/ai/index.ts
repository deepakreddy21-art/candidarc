import { getEnv } from "../config/env";
import { AnthropicProvider } from "./anthropic-provider";
import { MockGenerationProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai-provider";
import type { EmbeddingProvider, GenerationProvider, SpeechProvider } from "./types";
import { AiProviderError } from "./types";

export type AiRole = "generation" | "hr-audit" | "em-audit" | "final-review";

const providers = new Map<AiRole, GenerationProvider>();

export function getGenerationProvider(): GenerationProvider {
  return getProviderForRole("generation");
}

export function getProviderForRole(role: AiRole): GenerationProvider {
  const cached = providers.get(role);
  if (cached) return cached;
  const env = getEnv();
  if (env.AI_MODE === "mock") {
    if (env.APP_MODE === "production") {
      throw new AiProviderError("MOCK_PROVIDER_FORBIDDEN", "Mock AI is forbidden in production", false);
    }
    const provider = new MockGenerationProvider();
    providers.set(role, provider);
    return provider;
  }

  const selected = {
    generation: env.AI_GENERATION_PROVIDER,
    "hr-audit": env.AI_HR_AUDIT_PROVIDER,
    "em-audit": env.AI_EM_AUDIT_PROVIDER,
    "final-review": env.AI_FINAL_REVIEW_PROVIDER,
  }[role];
  if (selected === "mock") {
    throw new AiProviderError("MOCK_PROVIDER_FORBIDDEN", `Mock AI is forbidden for ${role} in live mode`, false);
  }
  if (selected === "openai" && !env.OPENAI_API_KEY) {
    throw new AiProviderError("OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is required for the OpenAI provider", false);
  }
  if (selected === "anthropic" && !env.ANTHROPIC_API_KEY) {
    throw new AiProviderError("ANTHROPIC_API_KEY_MISSING", "ANTHROPIC_API_KEY is required for the Anthropic provider", false);
  }
  const provider = selected === "openai" ? new OpenAIProvider() : new AnthropicProvider();
  providers.set(role, provider);
  return provider;
}

export function resetGenerationProvider() {
  providers.clear();
}

/** Stub embedding provider for local/dev */
export class StubEmbeddingProvider implements EmbeddingProvider {
  readonly name = "stub-embedding";
  async embed(request: import("./types").EmbeddingRequest): Promise<import("./types").EmbeddingResult> {
    void request;
    throw new AiProviderError("NOT_IMPLEMENTED", "Embedding provider not configured", false);
  }
}

/** Stub speech provider for local/dev */
export class StubSpeechProvider implements SpeechProvider {
  readonly name = "stub-speech";
  async transcribe(request: import("./types").SpeechToTextRequest): Promise<import("./types").SpeechToTextResult> {
    void request;
    throw new AiProviderError("NOT_IMPLEMENTED", "Speech provider not configured", false);
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  return new StubEmbeddingProvider();
}

export function getSpeechProvider(): SpeechProvider {
  return new StubSpeechProvider();
}

export * from "./types";
export * from "./prompt-registry";
export * from "./schemas";
export { MockGenerationProvider } from "./mock-provider";
export { OpenAIProvider } from "./openai-provider";
export { AnthropicProvider } from "./anthropic-provider";
