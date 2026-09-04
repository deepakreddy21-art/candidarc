import type { z } from "zod";

export type ModelConfig = {
  provider: string;
  model: string;
  temperature?: number;
  maxOutputTokens?: number;
};

export type PromptRef = {
  id: string;
  version: string;
  rubricVersion?: string;
};

export type UsageStats = {
  inputTokens: number;
  outputTokens: number;
  estimatedCostCents: number;
};

export type StructuredGenerationRequest<T> = {
  prompt: PromptRef;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  model?: ModelConfig;
  timeoutMs?: number;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
};

export type StructuredGenerationResult<T> = {
  data: T;
  rawText: string;
  model: ModelConfig;
  prompt: PromptRef;
  usage: UsageStats;
  latencyMs: number;
};

export type StreamingGenerationRequest = {
  prompt: PromptRef;
  system: string;
  user: string;
  model?: ModelConfig;
  abortSignal?: AbortSignal;
  metadata?: Record<string, unknown>;
};

export type StreamingGenerationEvent =
  | { type: "delta"; text: string }
  | { type: "done"; usage: UsageStats; model: ModelConfig }
  | { type: "error"; code: string; message: string };

export interface GenerationProvider {
  readonly name: string;
  generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>>;
  streamText(request: StreamingGenerationRequest): AsyncIterable<StreamingGenerationEvent>;
}

export type EmbeddingRequest = {
  texts: string[];
  model?: string;
  abortSignal?: AbortSignal;
};

export type EmbeddingResult = {
  vectors: number[][];
  model: string;
  usage: UsageStats;
};

/** Stub — implement with real provider later */
export interface EmbeddingProvider {
  readonly name: string;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

export type SpeechToTextRequest = {
  audioKey: string;
  language?: string;
  abortSignal?: AbortSignal;
};

export type SpeechToTextResult = {
  text: string;
  segments: Array<{ startMs: number; endMs: number; text: string }>;
  usage: UsageStats;
};

export type TextToSpeechRequest = {
  text: string;
  voice?: string;
  abortSignal?: AbortSignal;
};

export type TextToSpeechResult = {
  audioKey: string;
  mimeType: string;
  usage: UsageStats;
};

/** Stub — implement with real provider later */
export interface SpeechProvider {
  readonly name: string;
  transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResult>;
  synthesize?(request: TextToSpeechRequest): Promise<TextToSpeechResult>;
}

export class AiProviderError extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = false,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
