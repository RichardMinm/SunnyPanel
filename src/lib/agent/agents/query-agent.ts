import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildQueryAgentSystemPrompt } from "../prompts/query";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";

export const enrichQueryIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildQueryAgentSystemPrompt,
    context,
    intent,
    message,
    upstreamContext,
  });
