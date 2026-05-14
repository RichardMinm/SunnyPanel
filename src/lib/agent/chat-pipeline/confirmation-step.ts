import { isCancellationReply, isConfirmationReply } from "../intent";
import { createIntentFromProposedAction } from "../safety";
import type { AgentIntent, PendingAction, ProposedAgentAction } from "../schemas";

export type StructuredConfirmation = {
  actionId: string;
  type: "cancel" | "confirm";
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseStructuredConfirmation = (body: Record<string, unknown>): null | StructuredConfirmation => {
  const raw = body.confirmation;

  if (!isRecord(raw)) {
    return null;
  }

  const type = raw.type === "confirm" || raw.type === "cancel" ? raw.type : null;
  const actionId = typeof raw.actionId === "string" ? raw.actionId.trim() : "";

  if (!type || !actionId) {
    return null;
  }

  return {
    actionId,
    type,
  };
};

export const confirmationMatchesPending = (
  pending: Extract<PendingAction, { type: "await_confirmation" }>,
  confirmation: StructuredConfirmation,
) => pending.action.id === confirmation.actionId;

export type ConfirmationSignals = {
  cancel: boolean;
  confirm: boolean;
};

/** 在已处于 `await_confirmation` 时，由信号推导下一步（纯函数，便于单测）。 */
export type AwaitConfirmationBranch = "cancel" | "confirmed" | "still_waiting";

export const resolveAwaitConfirmationBranch = (
  _pendingAction: Extract<PendingAction, { type: "await_confirmation" }>,
  signals: ConfirmationSignals,
): AwaitConfirmationBranch => {
  if (signals.cancel) {
    return "cancel";
  }

  if (!signals.confirm) {
    return "still_waiting";
  }

  return "confirmed";
};

export const resolveConfirmationSignals = ({
  confirmation,
  message,
  pendingAction,
}: {
  confirmation: null | StructuredConfirmation;
  message: string;
  pendingAction: null | PendingAction;
}): ConfirmationSignals => {
  if (pendingAction?.type !== "await_confirmation") {
    return {
      cancel: false,
      confirm: false,
    };
  }

  if (confirmation) {
    if (confirmationMatchesPending(pendingAction, confirmation)) {
      return {
        cancel: confirmation.type === "cancel",
        confirm: confirmation.type === "confirm",
      };
    }
  }

  return {
    cancel: isCancellationReply(message),
    confirm: isConfirmationReply(message),
  };
};

export const restoreConfirmedIntent = (action: ProposedAgentAction): AgentIntent => {
  const confirmedIntent = createIntentFromProposedAction(action);

  if (!confirmedIntent) {
    throw new Error("Pending confirmation action could not be restored.");
  }

  return confirmedIntent;
};
