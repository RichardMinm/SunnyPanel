import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildContentAgentSystemPrompt } from "../prompts/content";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";

export const enrichContentIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildContentAgentSystemPrompt,
    context,
    intent,
    message,
  });
