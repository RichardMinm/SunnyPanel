import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildReviewAgentSystemPrompt } from "../prompts/review";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";

export const enrichReviewIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildReviewAgentSystemPrompt,
    context,
    intent,
    message,
  });
