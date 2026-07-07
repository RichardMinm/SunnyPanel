/**
 * Feature flag for LLM-assisted clarification composer.
 *
 * AGENT_LLM_CLARIFICATION_COMPOSER=0 → force fallback (deterministic templates)
 * AGENT_LLM_CLARIFICATION_COMPOSER=1 → try LLM, fallback on failure
 * AGENT_DISABLE_LLM=1          → force fallback (global override)
 */

export const isClarificationComposerLLMEnabled = (): boolean => {
  if (process.env.AGENT_DISABLE_LLM === "1") return false;
  if (process.env.AGENT_LLM_CLARIFICATION_COMPOSER === "0") return false;
  if (process.env.AGENT_LLM_CLARIFICATION_COMPOSER === "false") return false;
  return true;
};
