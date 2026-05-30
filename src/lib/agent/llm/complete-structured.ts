import { fetchWithRetry, getAgentModelConfig, streamChatCompletion, type StreamTokenCallback } from "../client";
import { extractJSONObject } from "../schemas";
import { createTokenUsageSnapshot, estimateTokenCount, mergeProviderTokenUsage } from "../token-usage";

export type StructuredLLMMessage = {
  content: string;
  role: "system" | "user" | "assistant";
};

export type CompleteStructuredOptions<T> = {
  fallback?: () => T | null | Promise<T | null>;
  messages: StructuredLLMMessage[];
  parse: (value: unknown) => T | null;
  temperature?: number;
};

export type StructuredLLMResult<T> = {
  data: T;
  raw: string;
  tokenUsage: ReturnType<typeof createTokenUsageSnapshot>;
};

export const completeStructured = async <T>({
  fallback,
  messages,
  parse,
  temperature = 0.3,
}: CompleteStructuredOptions<T>): Promise<StructuredLLMResult<T> | null> => {
  if (process.env.AGENT_DISABLE_LLM === "1") {
    const fallbackData = fallback ? await fallback() : null;

    return fallbackData
      ? { data: fallbackData, raw: "", tokenUsage: createTokenUsageSnapshot() }
      : null;
  }

  let config: Awaited<ReturnType<typeof getAgentModelConfig>> | null = null;

  try {
    config = await getAgentModelConfig();
  } catch {
    config = null;
  }

  if (!config) {
    if (!fallback) {
      return null;
    }

    const fallbackData = await fallback();

    return fallbackData
      ? { data: fallbackData, raw: "", tokenUsage: createTokenUsageSnapshot() }
      : null;
  }

  const estimatedUsage = createTokenUsageSnapshot({
    contextTokens: estimateTokenCount(messages.filter((m) => m.role !== "user").map((m) => m.content).join("\n")),
    inputTokens: estimateTokenCount(messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")),
  });

  try {
    const response = await fetchWithRetry(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        messages,
        model: config.model,
        temperature,
      }),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { completion_tokens?: number; prompt_tokens?: number; total_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new Error("Empty LLM response");
    }

    const jsonString = extractJSONObject(content);

    if (!jsonString) {
      throw new Error("No JSON in LLM response");
    }

    const parsed = parse(JSON.parse(jsonString));

    if (!parsed) {
      throw new Error("JSON failed schema validation");
    }

    const tokenUsage = mergeProviderTokenUsage(
      {
        ...estimatedUsage,
        outputTokens: estimateTokenCount(content),
        totalTokens: estimatedUsage.contextTokens + estimatedUsage.inputTokens + estimateTokenCount(content),
      },
      payload.usage,
    );

    return { data: parsed, raw: content, tokenUsage };
  } catch {
    if (!fallback) {
      return null;
    }

    const fallbackData = await fallback();

    if (!fallbackData) {
      return null;
    }

    return {
      data: fallbackData,
      raw: "",
      tokenUsage: estimatedUsage,
    };
  }
};

/**
 * Streaming variant of `completeStructured`: streams raw LLM output via `onToken`
 * while accumulating for final JSON extraction + schema validation.
 */
export const completeStructuredStreaming = async <T>({
  fallback,
  messages,
  parse,
  temperature = 0.3,
  onToken,
  signal,
}: CompleteStructuredOptions<T> & {
  onToken?: StreamTokenCallback;
  signal?: AbortSignal;
}): Promise<StructuredLLMResult<T> | null> => {
  const config = await getAgentModelConfig();

  if (!config) {
    if (!fallback) return null;
    const fallbackData = await fallback();
    return fallbackData
      ? { data: fallbackData, raw: "", tokenUsage: createTokenUsageSnapshot() }
      : null;
  }

  const estimatedUsage = createTokenUsageSnapshot({
    contextTokens: estimateTokenCount(messages.filter((m) => m.role !== "user").map((m) => m.content).join("\n")),
    inputTokens: estimateTokenCount(messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")),
  });

  try {
    let accumulated = "";
    const providerUsage = await streamChatCompletion({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      messages,
      model: config.model,
      onToken: (token) => {
        accumulated += token;
        onToken?.(token);
      },
      signal,
      temperature,
    });

    const content = accumulated.trim();
    if (!content) throw new Error("Empty LLM response");

    const jsonString = extractJSONObject(content);
    if (!jsonString) throw new Error("No JSON in LLM response");

    const parsed = parse(JSON.parse(jsonString));
    if (!parsed) throw new Error("JSON failed schema validation");

    const tokenUsage = providerUsage
      ? mergeProviderTokenUsage(
          {
            ...estimatedUsage,
            outputTokens: providerUsage.completionTokens,
            totalTokens: estimatedUsage.contextTokens + estimatedUsage.inputTokens + providerUsage.completionTokens,
          },
          {
            completion_tokens: providerUsage.completionTokens,
            prompt_tokens: providerUsage.promptTokens,
            total_tokens: providerUsage.promptTokens + providerUsage.completionTokens,
          },
        )
      : mergeProviderTokenUsage(
          {
            ...estimatedUsage,
            outputTokens: estimateTokenCount(content),
            totalTokens: estimatedUsage.contextTokens + estimatedUsage.inputTokens + estimateTokenCount(content),
          },
          undefined,
        );

    return { data: parsed, raw: content, tokenUsage };
  } catch {
    if (!fallback) return null;
    const fallbackData = await fallback();
    if (!fallbackData) return null;
    return { data: fallbackData, raw: "", tokenUsage: estimatedUsage };
  }
};
