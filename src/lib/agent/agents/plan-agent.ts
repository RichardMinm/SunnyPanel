import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildPlanAgentSystemPrompt } from "../prompts/plan";
import type { AgentIntent, ComposePlanArgs } from "../schemas";
import type { AgentPromptContext } from "../prompts";
import { normalizeComposePlanArgs } from "../workflows/plan-seed";

export const enrichPlanIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
): Promise<AgentIntent | null> => {
  const enriched = await enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildPlanAgentSystemPrompt,
    context,
    intent,
    message,
    upstreamContext,
  });

  if (enriched.intent !== "compose_plan") {
    return enriched;
  }

  return {
    ...enriched,
    args: normalizeComposePlanArgs(enriched.args as ComposePlanArgs),
  };
};
