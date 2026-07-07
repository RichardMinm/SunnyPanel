/**
 * LLM Required Mode — feature flag & availability check.
 *
 * AGENT_REQUIRE_LLM=0 (default) → existing behavior unchanged
 * AGENT_REQUIRE_LLM=1           → no LLM → Agent unavailable
 *
 * When AGENT_REQUIRE_LLM=1:
 *  - AGENT_DISABLE_LLM=1        → unavailable (llm_disabled)
 *  - Missing API key            → unavailable (llm_missing_api_key)
 *  - Missing model config       → unavailable (llm_missing_config)
 *
 * This check is synchronous for env-flag reasons and async for config
 * verification. It does NOT make a real LLM network call.
 */

import type { AgentLLMAvailability } from "./types";

export const isAgentRequireLLMEnabled = (): boolean =>
  process.env.AGENT_REQUIRE_LLM === "1";

export const isAgentLLMDisabled = (): boolean =>
  process.env.AGENT_DISABLE_LLM === "1";

/**
 * Check whether the Agent LLM is available.
 *
 * When AGENT_REQUIRE_LLM is not "1", always returns { available: true }
 * to preserve existing behavior.
 *
 * When AGENT_REQUIRE_LLM=1, verifies:
 *  1. AGENT_DISABLE_LLM is not "1"
 *  2. Model config (API key, base URL, model) is present
 *
 * This does NOT make a real LLM call — only checks configuration.
 */
export const checkAgentLLMAvailability = async (): Promise<AgentLLMAvailability> => {
  // Default mode — don't change existing behavior
  if (!isAgentRequireLLMEnabled()) {
    return { available: true };
  }

  // AGENT_REQUIRE_LLM=1 + AGENT_DISABLE_LLM=1 → unavailable
  if (isAgentLLMDisabled()) {
    return {
      available: false,
      reason: "llm_disabled",
      message:
        "LLM required mode is enabled (AGENT_REQUIRE_LLM=1), but LLM is disabled (AGENT_DISABLE_LLM=1).",
    };
  }

  // Check model configuration
  try {
    const { getAgentModelConfig } = await import("../client");
    const config = await getAgentModelConfig();

    if (!config) {
      return {
        available: false,
        reason: "llm_missing_config",
        message:
          "LLM required mode is enabled (AGENT_REQUIRE_LLM=1), but no model configuration is available.",
      };
    }

    /* getAgentModelConfig already validates apiKey — if it returned non-null,
     * apiKey is present. */
  } catch {
    return {
      available: false,
      reason: "llm_missing_config",
      message:
        "LLM required mode is enabled (AGENT_REQUIRE_LLM=1), but model configuration could not be loaded.",
    };
  }

  return { available: true };
};
