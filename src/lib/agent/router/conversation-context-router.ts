import type { PendingAction } from "../schemas";
import type { AgentConversationState } from "../conversation/types";

export type ConversationContextRouterInput = {
  conversationState?: AgentConversationState | null;
  message: string;
  pendingAction?: PendingAction | null;
};

export type ConversationContextRouterOutput = {
  conversationState: AgentConversationState | null;
  enrichedMessage: string;
  hasPendingConfirmation: boolean;
  pendingCapability?: string;
  pendingConfirmationActionId?: string;
};

export const routeConversationContext = (
  input: ConversationContextRouterInput,
): ConversationContextRouterOutput => {
  const pendingConfirmation =
    input.pendingAction?.type === "await_confirmation" ? input.pendingAction.action : null;

  return {
    conversationState: input.conversationState ?? null,
    enrichedMessage: input.message,
    hasPendingConfirmation: Boolean(pendingConfirmation),
    pendingCapability: pendingConfirmation?.capability,
    pendingConfirmationActionId: pendingConfirmation?.id,
  };
};
