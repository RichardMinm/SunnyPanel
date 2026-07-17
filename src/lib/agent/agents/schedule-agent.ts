import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildScheduleAgentSystemPrompt } from "../prompts/schedule";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";
import type { SpecializedAgentInvocationOptions } from "./types";

export const enrichScheduleIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
  options?: SpecializedAgentInvocationOptions,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildScheduleAgentSystemPrompt,
    context,
    intent,
    message,
    onProviderAttempt: options?.onProviderAttempt,
    upstreamContext,
  });
