import { generateIntentWithAgentModel } from "../client";
import type { AgentModelIntentResolver } from "../intent-resolution";
import type { AgentPromptContext } from "../prompts";
import type { AgentChatMessage, AgentEngine, AgentIntent, AgentTokenUsage, PendingAction } from "../schemas";
import { arbitrateAgentIntent, type AgentArbitrationDecision } from "./arbitration";
import { collectHeuristicCandidates } from "./heuristics";

/**
 * Phase 1 统一意图入口：优先 LLM 结构化解析，失败则用启发式候选集（非单一关键词链）。
 */
export const resolveUnifiedIntent = async (input: {
  context: AgentPromptContext;
  deterministicIntent?: AgentIntent | null;
  history: AgentChatMessage[];
  intentModelEngine?: AgentEngine;
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction?: PendingAction | null;
}): Promise<{
  arbitration: AgentArbitrationDecision;
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

  const candidates = collectHeuristicCandidates(input.message);
  const arbitration = await arbitrateAgentIntent({
    context: input.context,
    heuristicCandidates: candidates,
    history: input.history,
    message: input.message,
    modelDecision: modelResult?.arbitration ?? null,
    modelIntent: modelResult?.intent ?? input.deterministicIntent ?? null,
    pendingAction: input.pendingAction ?? null,
  });

  const modelIntentUsed = modelResult?.intent && arbitration.intent.intent === modelResult.intent.intent;

  return {
    arbitration,
    engine: modelIntentUsed ? input.intentModelEngine ?? "model" : "heuristic",
    intent: arbitration.intent,
    tokenUsage: modelResult?.tokenUsage,
  };
};
