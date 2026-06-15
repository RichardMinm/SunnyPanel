import { enrichIntentWithAgentPrompt } from "./enrich-intent";
import { buildMemoryAgentSystemPrompt } from "../prompts/memory";
import type { AgentIntent } from "../schemas";
import type { AgentPromptContext } from "../prompts";

export const enrichMemoryIntent = async (
  intent: AgentIntent,
  context: AgentPromptContext,
  message: string,
  upstreamContext?: string,
): Promise<AgentIntent | null> =>
  enrichIntentWithAgentPrompt({
    buildSystemPrompt: buildMemoryAgentSystemPrompt,
    context,
    intent,
    message,
    upstreamContext,
  });
