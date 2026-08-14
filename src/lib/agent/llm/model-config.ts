/** Atomic model configuration.
 *
 * Every config is a complete, self-consistent provider+key+baseURL+model tuple.
 * Cross-provider mixing (e.g. DeepSeek key with OpenAI base URL) is prohibited.
 *
 * The `safeSummary()` function produces a log-safe representation that never
 * includes the apiKey.
 */

import type { ModelError } from "./model-errors";
import { modelNotConfigured } from "./model-errors";

export type ModelProvider = "deepseek" | "openai" | "openai-compatible" | "zai" | (string & {});

export type ModelApiProtocol = "chat_completions" | "responses";

export type ModelConfig = Readonly<{
  provider: ModelProvider;
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  maxOutputTokens?: number;
  thinkingMode?: "disabled" | "enabled";
  apiProtocol?: ModelApiProtocol;
  structuredOutputMode: "function_calling" | "json_schema" | "prompt_json" | "provider_default";
}>;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TEMPERATURE = 0.3;

const isOfficialDeepSeekHost = (baseURL: string): boolean => {
  try {
    return new URL(baseURL).hostname === "api.deepseek.com";
  } catch {
    return false;
  }
};

/**
 * DeepSeek V4 Flash is the only DeepSeek model currently documented for the
 * Responses API. Other models and providers retain their existing transport
 * unless the caller explicitly selects Responses.
 */
export const resolveModelApiProtocol = (
  config: Pick<ModelConfig, "apiProtocol" | "baseURL" | "model" | "provider">,
): ModelApiProtocol => {
  if (config.apiProtocol) return config.apiProtocol;
  if (
    config.model.toLowerCase() === "deepseek-v4-flash"
    && (
      config.provider === "deepseek"
      || isOfficialDeepSeekHost(config.baseURL)
    )
  ) {
    return "responses";
  }
  return "chat_completions";
};

/* ---- Factory ---- */

/** Create a validated ModelConfig from resolved values.
 *  Returns a ModelError if required fields are missing or inconsistent. */
export const createModelConfig = (params: {
  apiKey: string;
  baseURL: string;
  model: string;
  provider: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxOutputTokens?: number;
  thinkingMode?: ModelConfig["thinkingMode"];
  apiProtocol?: ModelApiProtocol;
  structuredOutputMode?: ModelConfig["structuredOutputMode"];
}): ModelConfig | ModelError => {
  const apiKey = params.apiKey?.trim();
  const baseURL = params.baseURL?.trim();
  const model = params.model?.trim();
  const provider = params.provider?.trim() || "unknown";

  if (!apiKey) {
    return modelNotConfigured("Missing apiKey — cannot configure model.");
  }

  if (!baseURL) {
    return modelNotConfigured("Missing baseURL — cannot configure model.");
  }

  if (!model) {
    return modelNotConfigured("Missing model name — cannot configure model.");
  }

  if (
    params.maxOutputTokens !== undefined
    && (!Number.isInteger(params.maxOutputTokens) || params.maxOutputTokens <= 0)
  ) {
    return modelNotConfigured(
      "maxOutputTokens must be a positive integer when configured.",
    );
  }

  return Object.freeze({
    provider,
    apiKey,
    baseURL: baseURL.replace(/\/+$/, ""),
    model,
    temperature: params.temperature ?? DEFAULT_TEMPERATURE,
    timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: params.maxRetries ?? DEFAULT_MAX_RETRIES,
    ...(params.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: params.maxOutputTokens }),
    ...(params.thinkingMode === undefined
      ? {}
      : { thinkingMode: params.thinkingMode }),
    apiProtocol: resolveModelApiProtocol({
      apiProtocol: params.apiProtocol,
      baseURL,
      model,
      provider,
    }),
    structuredOutputMode: params.structuredOutputMode ?? "provider_default",
  }) as ModelConfig;
};

/* ---- Safe summary ---- */

/** Returns a log-safe, human-readable summary of the config.
 *  NEVER includes the apiKey. */
export const summarizeModelConfig = (config: ModelConfig): string =>
  `${config.provider}/${config.model} via ${resolveModelApiProtocol(config)} @ ${new URL(config.baseURL).origin}`;

/* ---- Validation ---- */

/** Returns true if the config has all minimum required fields. */
export const isModelConfigValid = (config: ModelConfig): boolean =>
  config.apiKey.length > 0
  && config.baseURL.length > 0
  && config.model.length > 0;
