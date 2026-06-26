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
  conversationState?: import("../conversation/types").AgentConversationState | null;
  deterministicIntent?: AgentIntent | null;
  history: AgentChatMessage[];
  intentModelEngine?: AgentEngine;
  message: string;
  modelResolver?: AgentModelIntentResolver;
  pendingAction?: PendingAction | null;
  /** Phase 4B: session context block (advisory, not instruction) */
  sessionContext?: string | null;
  userContext?: { preferences?: import("../user-preferences").UserPreferences | null; userId: number };
}): Promise<{
  arbitration: AgentArbitrationDecision;
  engine: AgentEngine;
  intent: AgentIntent;
  tokenUsage?: AgentTokenUsage;
}> => {
  const { buildPreRouterGateInput } = await import("../capabilities/pre-router");
  const capabilityGate = buildPreRouterGateInput({
    conversationState: input.conversationState ?? null,
    message: input.message,
    userContext: input.userContext ?? { userId: 0 },
  });
  const resolveModel = input.modelResolver ?? generateIntentWithAgentModel;
  let modelResult: Awaited<ReturnType<AgentModelIntentResolver>> | null = null;

  // Phase 4B: inject session context as advisory context in the message
  const contextualMessage = input.sessionContext
    ? `${input.sessionContext}\n\n---\n\nUser Message:\n${input.message}`
    : input.message;

  try {
    modelResult = await resolveModel({
      context: input.context,
      deps: { capabilityGate },
      history: input.history,
      message: contextualMessage,
    });
  } catch (error) {
    console.warn("[agent] Intent model unavailable; falling back to heuristics.", error);
  }

  const candidates = collectHeuristicCandidates(input.message);
  const arbitration = await arbitrateAgentIntent({
    context: input.context,
    conversationState: input.conversationState ?? null,
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
