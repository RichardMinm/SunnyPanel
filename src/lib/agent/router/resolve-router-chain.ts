import type { AgentChatMessage, PendingAction } from "../schemas";
import type { AgentConversationState } from "../conversation/types";
import type { AgentSessionState, RouteHint } from "../session/types";
import { routeCapabilityRouter } from "./capability-router";
import { routeConversationContext } from "./conversation-context-router";
import { routeFollowUpRouter } from "./follow-up-router-output";
import { agentRouterFromLLM } from "./llm-router-to-agent-router";
import { mapLLMRouterToIntent } from "./map-llm-router-to-intent";
import type { LLMRouterOutput } from "./llm-router-schema";
import type { AgentRouterOutput } from "./types";

export type RouterChainSource = "capability" | "follow_up" | "llm" | "heuristic";

export type RouterChainResult = {
  intent: import("../schemas").AgentIntent;
  llmRouterOutput: LLMRouterOutput;
  routerOutput: AgentRouterOutput;
  source: RouterChainSource;
};

export type RouterChainInput = {
  conversationState?: AgentConversationState | null;
  history: AgentChatMessage[];
  message: string;
  pendingAction?: PendingAction | null;
  /** Phase 4B: session context block injected as advisory routing context */
  sessionContext?: string | null;
  /** Phase 4B: raw route hint for trace purposes */
  routeHint?: RouteHint | null;
  /** Phase 4B: session state for trace purposes */
  session?: AgentSessionState | null;
};

export const resolveRouterChain = (input: RouterChainInput): RouterChainResult | null => {
  routeConversationContext({
    conversationState: input.conversationState,
    message: input.message,
    pendingAction: input.pendingAction,
  });

  const capability = routeCapabilityRouter(input.message);

  if (capability) {
    const intent = mapLLMRouterToIntent(capability, input.message, input.conversationState);

    return {
      intent,
      llmRouterOutput: capability,
      routerOutput: agentRouterFromLLM({ intent, llmRouter: capability }),
      source: "capability",
    };
  }

  const followUp = routeFollowUpRouter(input);

  if (followUp) {
    const intent = mapLLMRouterToIntent(followUp, input.message, input.conversationState);

    return {
      intent,
      llmRouterOutput: followUp,
      routerOutput: agentRouterFromLLM({ intent, llmRouter: followUp }),
      source: "follow_up",
    };
  }

  return null;
};

export const attachRouterChainToResolution = (
  resolution: { intent: import("../schemas").AgentIntent },
  chain: RouterChainResult | null,
) => ({
  ...resolution,
  llmRouterOutput: chain?.llmRouterOutput,
  routerOutput: chain?.routerOutput,
});
