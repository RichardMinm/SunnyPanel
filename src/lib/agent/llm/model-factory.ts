/** LangChain chat model factory.
 *
 * Creates a ChatOpenAI instance from a validated ModelConfig.
 * All current providers (OpenAI, DeepSeek, ZAI) use OpenAI-compatible
 * REST APIs, so a single ChatOpenAI wrapper works for all of them.
 *
 * The factory is injectable — callers pass a factory function so tests
 * can supply fake models without real API keys.
 */

import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  resolveModelApiProtocol,
  type ModelApiProtocol,
  type ModelConfig,
} from "./model-config";
import {
  createSafeProtocolFetch,
  type SafeProviderResponseObserver,
} from "./structured-protocol";

/** Signature for an injectable model factory. */
export type ModelFactoryOptions = Readonly<{
  apiProtocol?: ModelApiProtocol;
  safeResponseObserver?: SafeProviderResponseObserver;
}>;

export type ModelFactory = (
  config: ModelConfig,
  options?: ModelFactoryOptions,
) => BaseChatModel;

const resolveProtocolBaseURL = (
  baseURL: string,
  apiProtocol: ModelApiProtocol,
): string => {
  if (apiProtocol !== "responses") return baseURL;
  try {
    const url = new URL(baseURL);
    if (url.hostname === "api.deepseek.com" && /^\/v1\/?$/u.test(url.pathname)) {
      return url.origin;
    }
  } catch {
    // ModelConfig validation owns invalid endpoint handling.
  }
  return baseURL;
};

/** Default factory: builds a ChatOpenAI instance configured for the given
 *  provider's OpenAI-compatible endpoint.
 *
 *  Does NOT make any network calls. Does NOT access the database.
 *  Only throws if the underlying ChatOpenAI constructor rejects the config. */
export const createChatModel: ModelFactory = (config, options) => {
  const apiProtocol = options?.apiProtocol ?? resolveModelApiProtocol(config);
  return new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    useResponsesApi: apiProtocol === "responses",
    configuration: {
      baseURL: resolveProtocolBaseURL(config.baseURL, apiProtocol),
      ...(options?.safeResponseObserver
        ? {
            fetch: createSafeProtocolFetch(
              globalThis.fetch.bind(globalThis),
              options.safeResponseObserver,
            ),
          }
        : {}),
    },
    temperature: config.temperature,
    maxTokens: config.maxOutputTokens,
    timeout: config.timeoutMs,
    maxRetries: 0, // retry is owned by the structured invocation layer
    ...(config.thinkingMode && apiProtocol === "chat_completions"
      ? { modelKwargs: { thinking: { type: config.thinkingMode } } }
      : {}),
  });
};
