import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildReviewAgentSystemPrompt } from "../prompts/review";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";
import type { SpecializedAgentInvocationOptions } from "./types";

export const enrichReviewIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
  options?: SpecializedAgentInvocationOptions,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildReviewAgentSystemPrompt,
    context,
    intent,
    message,
    onProviderAttempt: options?.onProviderAttempt,
    upstreamContext,
  });
