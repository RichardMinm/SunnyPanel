import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildContentAgentSystemPrompt } from "../prompts/content";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";
import type { SpecializedAgentInvocationOptions } from "./types";

export const enrichContentIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
  options?: SpecializedAgentInvocationOptions,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildContentAgentSystemPrompt,
    context,
    intent,
    message,
    onProviderAttempt: options?.onProviderAttempt,
    upstreamContext,
  });
