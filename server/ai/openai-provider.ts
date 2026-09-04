import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { getEnv } from "../config/env";
import {
  AiProviderError,
  type GenerationProvider,
  type StreamingGenerationEvent,
  type StreamingGenerationRequest,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "./types";

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAIProvider implements GenerationProvider {
  readonly name = "openai";
  private readonly client = new OpenAI({ apiKey: getEnv().OPENAI_API_KEY });

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const started = Date.now();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const model = request.model?.model ?? DEFAULT_MODEL;
        const completion = await this.client.chat.completions.parse({
          model,
          temperature: request.model?.temperature ?? 0,
          messages: [
            {
              role: "system",
              content: `${request.system}\nNever invent metrics, employers, dates, evidence, or achievements. Use only supplied facts and evidence IDs.`,
            },
            { role: "user", content: request.user },
          ],
          response_format: zodResponseFormat(request.schema, `candidarc_${request.prompt.id.replace(/\W/g, "_")}`),
        }, { signal: request.abortSignal, timeout: request.timeoutMs });
        const message = completion.choices[0]?.message;
        const rawText = message?.content ?? "";
        const data = request.schema.parse(message?.parsed ?? JSON.parse(rawText));
        validateEvidenceIds(data, request.metadata?.allowedEvidenceIds);
        const inputTokens = completion.usage?.prompt_tokens ?? 0;
        const outputTokens = completion.usage?.completion_tokens ?? 0;
        return {
          data,
          rawText,
          model: { provider: "openai", model, temperature: request.model?.temperature ?? 0 },
          prompt: request.prompt,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostCents: (inputTokens * 0.000015) + (outputTokens * 0.00006),
          },
          latencyMs: Date.now() - started,
        };
      } catch (error) {
        lastError = error;
      }
    }
    throw new AiProviderError("STRUCTURED_OUTPUT_INVALID", "OpenAI returned invalid structured output after retry", false, lastError);
  }

  async *streamText(request: StreamingGenerationRequest): AsyncIterable<StreamingGenerationEvent> {
    const model = request.model?.model ?? DEFAULT_MODEL;
    const stream = await this.client.chat.completions.create({
      model,
      stream: true,
      messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }],
    }, { signal: request.abortSignal });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta.content;
      if (text) yield { type: "delta", text };
    }
    yield { type: "done", usage: { inputTokens: 0, outputTokens: 0, estimatedCostCents: 0 }, model: { provider: "openai", model } };
  }
}

function validateEvidenceIds(data: unknown, allowed: unknown): void {
  if (!Array.isArray(allowed)) return;
  const valid = new Set(allowed.filter((item): item is string => typeof item === "string"));
  const inspect = (value: unknown, key = ""): void => {
    if (Array.isArray(value)) {
      if (/evidenceids?/i.test(key)) {
        const invalid = value.filter((item) => typeof item === "string" && !valid.has(item));
        if (invalid.length) throw new Error(`Unknown evidence IDs: ${invalid.join(", ")}`);
      }
      value.forEach((item) => inspect(item, key));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([childKey, child]) => inspect(child, childKey));
    }
  };
  inspect(data);
}
