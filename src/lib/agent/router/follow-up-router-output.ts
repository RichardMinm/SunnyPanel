import { routeFollowUpIntent, shouldBlockClarifyFallback } from "../conversation/follow-up-router";
import type { AgentConversationState } from "../conversation/types";
import type { AgentChatMessage } from "../schemas";
import { mapLLMRouterToIntent } from "./map-llm-router-to-intent";
import type { LLMRouterOutput } from "./llm-router-schema";

export const routeFollowUpRouter = (input: {
  conversationState?: AgentConversationState | null;
  history: AgentChatMessage[];
  message: string;
}): LLMRouterOutput | null => {
  const followUpIntent = routeFollowUpIntent(input);

  if (!followUpIntent) {
    return null;
  }

  const topic =
    followUpIntent.intent === "expand_answer" ||
    followUpIntent.intent === "explain_concept" ||
    followUpIntent.intent === "give_examples" ||
    followUpIntent.intent === "compare_concepts" ||
    followUpIntent.intent === "give_learning_path" ||
    followUpIntent.intent === "summarize_answer" ||
    followUpIntent.intent === "rewrite_answer"
      ? followUpIntent.args.topic
      : input.conversationState?.lastTopic ?? "该主题";

  const action =
    followUpIntent.intent === "expand_answer"
      ? "expand_answer"
      : followUpIntent.intent === "summarize_answer"
        ? "summarize"
        : "explain";

  return {
    action,
    confidence: followUpIntent.confidence ?? 0.88,
    needsClarification: false,
    requiresConfirmation: false,
    riskLevel: "none",
    slots: { sourceText: input.message, topic },
    target: "last_topic",
    topic,
    userVisibleReason: `基于上一轮主题「${topic}」继续展开回答。`,
    writeRequired: false,
  };
};

export const followUpRouterIntent = (input: {
  conversationState?: AgentConversationState | null;
  history: AgentChatMessage[];
  message: string;
}) => {
  const router = routeFollowUpRouter(input);

  if (!router) {
    return null;
  }

  return mapLLMRouterToIntent(router, input.message, input.conversationState);
};

export { shouldBlockClarifyFallback };
