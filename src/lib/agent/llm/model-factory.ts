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
import type { ModelConfig } from "./model-config";

/** Signature for an injectable model factory. */
export type ModelFactory = (config: ModelConfig) => BaseChatModel;

/** Default factory: builds a ChatOpenAI instance configured for the given
 *  provider's OpenAI-compatible endpoint.
 *
 *  Does NOT make any network calls. Does NOT access the database.
 *  Only throws if the underlying ChatOpenAI constructor rejects the config. */
export const createChatModel: ModelFactory = (config: ModelConfig) =>
  new ChatOpenAI({
    apiKey: config.apiKey,
    model: config.model,
    configuration: {
      baseURL: config.baseURL,
    },
    temperature: config.temperature,
    timeout: config.timeoutMs,
    maxRetries: 0, // retry is owned by the structured invocation layer
  });
