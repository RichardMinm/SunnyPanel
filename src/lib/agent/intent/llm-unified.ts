import { generateIntentWithAgentModel } from "../client";
import type { AgentModelIntentResolver } from "../intent-resolution";
import type { AgentPromptContext } from "../prompts";
import type { AgentChatMessage, AgentEngine, AgentIntent, AgentTokenUsage } from "../schemas";
import { collectHeuristicCandidates, parseHeuristicIntent } from "./heuristics";

/**
 * Phase 1 统一意图入口：优先 LLM 结构化解析，失败则用启发式候选集（非单一关键词链）。
 */
export const resolveUnifiedIntent = async (input: {
  context: AgentPromptContext;
  history: AgentChatMessage[];
  intentModelEngine?: AgentEngine;
  message: string;
  modelResolver?: AgentModelIntentResolver;
}): Promise<{
  engine: AgentEngine;
  intent: AgentIntent;
  tokenUsage?: AgentTokenUsage;
}> => {
  const resolveModel = input.modelResolver ?? generateIntentWithAgentModel;
  let modelResult: Awaited<ReturnType<AgentModelIntentResolver>> | null = null;

  try {
    modelResult = await resolveModel({
      context: input.context,
      history: input.history,
      message: input.message,
    });
  } catch (error) {
    console.warn("[agent] Intent model unavailable; falling back to heuristics.", error);
  }

  if (modelResult) {
    return {
      engine: input.intentModelEngine ?? "model",
      intent: modelResult.intent,
      tokenUsage: modelResult.tokenUsage,
    };
  }

  const candidates = collectHeuristicCandidates(input.message);

  if (candidates.length > 0 && (candidates[0].intent.confidence ?? 0) >= 0.3) {
    return {
      engine: "heuristic",
      intent: candidates[0].intent,
    };
  }

  return {
    engine: "heuristic",
    intent: parseHeuristicIntent(input.message),
  };
};
