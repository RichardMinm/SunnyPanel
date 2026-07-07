/**
 * Feature flag for LLM-assisted schedule slot extraction.
 *
 * AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR=0 → deterministic only
 * AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR=1 → deterministic + LLM merge
 * AGENT_DISABLE_LLM=1              → force deterministic (global override)
 */

export const isLLMSlotExtractorEnabled = (): boolean => {
  if (process.env.AGENT_DISABLE_LLM === "1") return false;
  if (process.env.AGENT_LLM_SCHEDULE_SLOT_EXTRACTOR === "1") return true;
  return false;
};
