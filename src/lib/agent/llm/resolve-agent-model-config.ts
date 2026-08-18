import {
  createModelConfig,
  type ModelApiProtocol,
  type ModelConfig,
} from "./model-config";
import { isModelError } from "./model-errors";

export type AgentModelSettings = Readonly<{
  apiKey: string;
  apiProtocol?: ModelApiProtocol;
  baseUrl: string;
  model: string;
  provider?: null | string;
}>;

export type AgentModelSettingsResolver = () => Promise<AgentModelSettings | null>;

export type AgentStructuredModelOverrides = Readonly<{
  maxOutputTokens?: number;
  maxRetries?: number;
  temperature?: number;
  timeoutMs?: number;
}>;

/**
 * Adapt the application-level Agent settings into one atomic shared ModelConfig.
 * The returned object never mixes provider credentials/endpoints and is safe to
 * pass to createChatModel()/invokeStructured().
 */
export const resolveAgentStructuredModelConfig = async (
  getConfig?: AgentModelSettingsResolver,
  overrides: AgentStructuredModelOverrides = {},
): Promise<ModelConfig | null> => {
  const resolver = getConfig
    ?? (await import("../client")).getAgentModelConfig;
  const settings = await resolver();
  if (!settings) return null;

  const resolved = createModelConfig({
    apiKey: settings.apiKey,
    apiProtocol: settings.apiProtocol,
    baseURL: settings.baseUrl,
    maxOutputTokens: overrides.maxOutputTokens,
    maxRetries: overrides.maxRetries,
    model: settings.model,
    provider: settings.provider ?? "openai-compatible",
    temperature: overrides.temperature,
    timeoutMs: overrides.timeoutMs,
  });

  return isModelError(resolved) ? null : resolved;
};
