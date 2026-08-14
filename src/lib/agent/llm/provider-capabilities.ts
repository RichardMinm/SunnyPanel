/** Deterministic provider capability lookup.
 *
 * Capability profiles are selected deterministically from provider, model, and
 * API protocol. They are never inferred from runtime model output.
 *
 * Unknown providers fall back to the most conservative profile.
 */

import type { ModelErrorCode } from "./model-errors";
import {
  resolveModelApiProtocol,
  type ModelConfig,
} from "./model-config";

export type StructuredOutputMode =
  | "native_json_schema"
  | "function_calling"
  | "prompt_json"
  | "unsupported";

export type ProviderCapabilityProfile = Readonly<{
  provider: string;
  supportsStreaming: boolean;
  supportsToolCalling: boolean;
  supportsNativeJsonSchema: boolean;
  structuredOutputMode: StructuredOutputMode;
  knownErrorCodeMappings: Record<string, ModelErrorCode>;
}>;

/* ---- Profiles ---- */

const OPENAI_PROFILE: ProviderCapabilityProfile = {
  provider: "openai",
  supportsStreaming: true,
  supportsToolCalling: true,
  supportsNativeJsonSchema: true,
  structuredOutputMode: "native_json_schema",
  knownErrorCodeMappings: {
    "401": "MODEL_AUTH_FAILED",
    "429": "MODEL_RATE_LIMITED",
    "500": "MODEL_UNAVAILABLE",
    "502": "MODEL_UNAVAILABLE",
    "503": "MODEL_UNAVAILABLE",
  },
};

/** DeepSeek v4-pro (reasoning model) does NOT support tool_choice or
 *  native json_schema. Use jsonMode (response_format json_object)
 *  which works when the user/system prompt mentions "json". */
const DEEPSEEK_PROFILE: ProviderCapabilityProfile = {
  provider: "deepseek",
  supportsStreaming: true,
  supportsToolCalling: false,
  supportsNativeJsonSchema: false,
  structuredOutputMode: "prompt_json",
  knownErrorCodeMappings: {
    "401": "MODEL_AUTH_FAILED",
    "429": "MODEL_RATE_LIMITED",
    "500": "MODEL_UNAVAILABLE",
    "502": "MODEL_UNAVAILABLE",
    "503": "MODEL_UNAVAILABLE",
  },
};

const DEEPSEEK_FLASH_RESPONSES_PROFILE: ProviderCapabilityProfile = {
  provider: "deepseek",
  supportsStreaming: true,
  supportsToolCalling: true,
  supportsNativeJsonSchema: true,
  structuredOutputMode: "native_json_schema",
  knownErrorCodeMappings: DEEPSEEK_PROFILE.knownErrorCodeMappings,
};

/** ZAI (OpenAI-compatible). Conservative: use prompt_json mode as the safest
 *  fallback since tool calling support varies by deployment. */
const ZAI_PROFILE: ProviderCapabilityProfile = {
  provider: "zai",
  supportsStreaming: true,
  supportsToolCalling: true,
  supportsNativeJsonSchema: false,
  structuredOutputMode: "function_calling",
  knownErrorCodeMappings: {
    "401": "MODEL_AUTH_FAILED",
    "429": "MODEL_RATE_LIMITED",
    "500": "MODEL_UNAVAILABLE",
    "502": "MODEL_UNAVAILABLE",
    "503": "MODEL_UNAVAILABLE",
  },
};

/** Generic OpenAI-compatible endpoint. Most conservative profile — assumes
 *  only basic chat completion support. */
const OPENAI_COMPATIBLE_PROFILE: ProviderCapabilityProfile = {
  provider: "openai-compatible",
  supportsStreaming: true,
  supportsToolCalling: false,
  supportsNativeJsonSchema: false,
  structuredOutputMode: "prompt_json",
  knownErrorCodeMappings: {
    "401": "MODEL_AUTH_FAILED",
    "429": "MODEL_RATE_LIMITED",
    "500": "MODEL_UNAVAILABLE",
    "502": "MODEL_UNAVAILABLE",
    "503": "MODEL_UNAVAILABLE",
  },
};

/** Fallback for unknown providers — most conservative. */
const UNKNOWN_PROFILE: ProviderCapabilityProfile = {
  provider: "unknown",
  supportsStreaming: false,
  supportsToolCalling: false,
  supportsNativeJsonSchema: false,
  structuredOutputMode: "prompt_json",
  knownErrorCodeMappings: {
    "401": "MODEL_AUTH_FAILED",
    "429": "MODEL_RATE_LIMITED",
    "500": "MODEL_UNAVAILABLE",
    "502": "MODEL_UNAVAILABLE",
    "503": "MODEL_UNAVAILABLE",
  },
};

const PROFILES: Record<string, ProviderCapabilityProfile> = {
  openai: OPENAI_PROFILE,
  deepseek: DEEPSEEK_PROFILE,
  zai: ZAI_PROFILE,
  "openai-compatible": OPENAI_COMPATIBLE_PROFILE,
};

/* ---- Public API ---- */

/** Returns the capability profile for a given provider string.
 *  Unknown providers get the conservative UNKNOWN_PROFILE. */
type ProviderCapabilityInput = string | Pick<
  ModelConfig,
  "apiProtocol" | "baseURL" | "model" | "provider"
>;

const isOfficialDeepSeekFlash = (
  input: Exclude<ProviderCapabilityInput, string>,
): boolean => {
  let officialHost = false;
  try {
    officialHost = new URL(input.baseURL).hostname === "api.deepseek.com";
  } catch {
    officialHost = false;
  }
  return input.model.toLowerCase() === "deepseek-v4-flash"
    && (input.provider === "deepseek" || officialHost);
};

export const getProviderCapabilities = (
  input: ProviderCapabilityInput,
): ProviderCapabilityProfile => {
  if (typeof input === "string") {
    return PROFILES[input] ?? { ...UNKNOWN_PROFILE, provider: input };
  }

  const protocol = resolveModelApiProtocol(input);
  if (protocol === "responses" && isOfficialDeepSeekFlash(input)) {
    return { ...DEEPSEEK_FLASH_RESPONSES_PROFILE, provider: input.provider };
  }
  if (protocol === "responses" && input.provider !== "openai") {
    return {
      ...UNKNOWN_PROFILE,
      provider: input.provider,
      structuredOutputMode: "unsupported",
    };
  }
  return PROFILES[input.provider]
    ?? { ...UNKNOWN_PROFILE, provider: input.provider };
};

/** Convenience: get the structured output mode for a provider. */
export const getStructuredOutputMode = (
  provider: ProviderCapabilityInput,
): StructuredOutputMode =>
  getProviderCapabilities(provider).structuredOutputMode;

/** Map an HTTP status code to a ModelErrorCode using the provider's known
 *  error mappings. Returns MODEL_UNAVAILABLE for unmapped non-2xx codes. */
export const mapStatusCodeToError = (
  provider: string,
  statusCode: number,
): ModelErrorCode => {
  const profile = getProviderCapabilities(provider);
  const key = String(statusCode);
  return profile.knownErrorCodeMappings[key] ?? "MODEL_UNAVAILABLE";
};
