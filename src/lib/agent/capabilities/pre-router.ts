/**
 * R6-C1-D-B: Legacy pre-router retired.
 *
 * Previously imported parseCapabilityQueryIntent (from intent/heuristics/query)
 * and collectHeuristicCandidates (from intent/heuristics/index).
 * Now returns a controlled retired result — no business intent guessing.
 *
 * This file is kept as a retired shell for backward compatibility.
 * To be deleted in R6-C1-E.
 */

import type { AgentConversationState } from "../conversation/types";
import type { AgentRouterAction } from "../router/types";
import type { AgentIntent } from "../schemas";
import type { UserPreferences } from "../user-preferences";
import type { CapabilityGateInput } from "./types";

export const buildPreRouterGateInput = (_input: {
  conversationState?: AgentConversationState | null;
  message: string;
  userContext: { preferences?: UserPreferences | null; userId: number };
}): CapabilityGateInput => ({
  conversationState: _input.conversationState ?? null,
  intent: { args: {}, confidence: 0, intent: "clarify" } as AgentIntent,
  router: { action: "answer" as AgentRouterAction, confidence: 0, requiresWrite: false, reason: "Legacy pre-router retired", intent: { args: {}, confidence: 0, intent: "clarify" } as AgentIntent, target: {} },
  userContext: _input.userContext,
});

export const estimateRouterAction = (_message: string): AgentRouterAction => "answer";
