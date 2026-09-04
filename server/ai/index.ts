import { getEnv } from "../config/env";
import { MockGenerationProvider } from "./mock-provider";
import { OpenAIProvider } from "./openai-provider";
import type { EmbeddingProvider, GenerationProvider, SpeechProvider } from "./types";
import { AiProviderError } from "./types";

let generationProvider: GenerationProvider | null = null;

export function getGenerationProvider(): GenerationProvider {
  if (generationProvider) return generationProvider;
  const env = getEnv();
  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) {
      throw new AiProviderError("OPENAI_API_KEY_MISSING", "OPENAI_API_KEY is required for the OpenAI provider", false);
    } else {
      generationProvider = new OpenAIProvider();
    }
  } else {
    if (env.APP_MODE === "production") {
      throw new AiProviderError("MOCK_PROVIDER_FORBIDDEN", "Mock AI is forbidden in production", false);
    }
    generationProvider = new MockGenerationProvider();
  }
  return generationProvider;
}

export function resetGenerationProvider() {
  generationProvider = null;
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
export { MockGenerationProvider } from "./mock-provider";
