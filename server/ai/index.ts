import { getEnv } from "../config/env";
import { logger } from "../observability/logger";
import { MockGenerationProvider } from "./mock-provider";
import type { EmbeddingProvider, GenerationProvider, SpeechProvider } from "./types";
import { AiProviderError } from "./types";

let generationProvider: GenerationProvider | null = null;

export function getGenerationProvider(): GenerationProvider {
  if (generationProvider) return generationProvider;
  const env = getEnv();
  if (env.AI_PROVIDER === "openai") {
    if (!env.OPENAI_API_KEY) {
      logger.warn("AI_PROVIDER=openai but OPENAI_API_KEY missing; falling back to mock");
      generationProvider = new MockGenerationProvider();
    } else {
      // Real OpenAI adapter is deferred; keep mock for Phase 2 vertical slice stability.
      logger.info("OpenAI provider selected but adapter not wired yet; using mock");
      generationProvider = new MockGenerationProvider();
    }
  } else {
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
