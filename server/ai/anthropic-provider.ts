import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "../config/env";
import { logger } from "../observability/logger";
import { validateEvidenceIds, validateResumeTechnologies } from "./evidence-guard";
import {
  AiProviderError,
  type GenerationProvider,
  type StreamingGenerationEvent,
  type StreamingGenerationRequest,
  type StructuredGenerationRequest,
  type StructuredGenerationResult,
} from "./types";

function textFromResponse(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

function isTransient(error: unknown): boolean {
  if (error instanceof Anthropic.APIConnectionError) return true;
  if (error instanceof Anthropic.APIError) return error.status === 429 || error.status >= 500;
  return false;
}

export class AnthropicProvider implements GenerationProvider {
  readonly name = "anthropic";
  private readonly client = new Anthropic({ apiKey: getEnv().ANTHROPIC_API_KEY });

  async generateStructured<T>(request: StructuredGenerationRequest<T>): Promise<StructuredGenerationResult<T>> {
    const started = Date.now();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const model = request.model?.model ?? getEnv().ANTHROPIC_AUDIT_MODEL;
        const response = await this.client.messages.create(
          {
            model,
            max_tokens: request.model?.maxOutputTokens ?? 4096,
            temperature: request.model?.temperature ?? 0,
            system: `${request.system}
Return only one valid JSON object matching the requested schema. Do not use markdown fences.
Never invent metrics, employers, dates, evidence, achievements, sources, or technologies. Use only supplied context and evidence IDs.`,
            messages: [{ role: "user", content: request.user }],
          },
          { signal: request.abortSignal, timeout: request.timeoutMs },
        );
        const rawText = textFromResponse(response);
        const data = request.schema.parse(parseJson(rawText));
        validateEvidenceIds(data, request.metadata?.allowedEvidenceIds);
        validateResumeTechnologies(data, request.metadata?.allowedTechnologies);
        const inputTokens = response.usage.input_tokens;
        const outputTokens = response.usage.output_tokens;
        const latencyMs = Date.now() - started;
        logger.info(
          { promptId: request.prompt.id, model, provider: "anthropic", latencyMs, inputTokens, outputTokens },
          "AI structured generation completed",
        );
        return {
          data,
          rawText,
          model: { provider: "anthropic", model, temperature: request.model?.temperature ?? 0 },
          prompt: request.prompt,
          usage: {
            inputTokens,
            outputTokens,
            estimatedCostCents: inputTokens * 0.0003 + outputTokens * 0.0015,
          },
          latencyMs,
        };
      } catch (error) {
        lastError = error;
        const parseFailure = error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError");
        if (attempt === 0 && (parseFailure || isTransient(error))) continue;
        break;
      }
    }
    throw new AiProviderError(
      "STRUCTURED_OUTPUT_INVALID",
      "Anthropic returned invalid structured output after retry",
      isTransient(lastError),
      lastError,
    );
  }

  async *streamText(request: StreamingGenerationRequest): AsyncIterable<StreamingGenerationEvent> {
    const model = request.model?.model ?? getEnv().ANTHROPIC_AUDIT_MODEL;
    const response = await this.client.messages.create(
      {
        model,
        max_tokens: request.model?.maxOutputTokens ?? 4096,
        temperature: request.model?.temperature ?? 0,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
      },
      { signal: request.abortSignal },
    );
    const text = textFromResponse(response);
    if (text) yield { type: "delta", text };
    yield {
      type: "done",
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        estimatedCostCents: response.usage.input_tokens * 0.0003 + response.usage.output_tokens * 0.0015,
      },
      model: { provider: "anthropic", model },
    };
  }
}
