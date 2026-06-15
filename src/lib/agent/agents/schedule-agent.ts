import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildScheduleAgentSystemPrompt } from "../prompts/schedule";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";

export const enrichScheduleIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildScheduleAgentSystemPrompt,
    context,
    intent,
    message,
    upstreamContext,
  });
