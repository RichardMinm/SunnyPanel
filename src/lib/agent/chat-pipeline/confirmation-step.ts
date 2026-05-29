import { restoreIntentsFromBatchConfirmation } from "../execution-graph";
import { isBatchConfirmationReply, isCancellationReply, isConfirmationReply } from "../intent-resolution";
import { createIntentFromProposedAction } from "../safety";
import type { AgentIntent, PendingAction, ProposedAgentAction } from "../schemas";

export type StructuredConfirmation = {
  actionId: string;
  batch?: boolean;
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
    ...(raw.batch === true ? { batch: true as const } : {}),
    type,
  };
};

export const confirmationMatchesPending = (
  pending: Extract<PendingAction, { type: "await_confirmation" }>,
  confirmation: StructuredConfirmation,
) => pending.action.id === confirmation.actionId;

export const confirmationMatchesBatchPending = (
  pending: Extract<PendingAction, { type: "await_batch_confirmation" }>,
  confirmation: StructuredConfirmation,
) =>
  confirmation.batch ||
  confirmation.actionId === "batch" ||
  confirmation.actionId === (pending.orchestrationId ?? "batch");

export type ConfirmationSignals = {
  cancel: boolean;
  confirm: boolean;
};

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
  if (pendingAction?.type === "await_batch_confirmation") {
    if (confirmation && confirmationMatchesBatchPending(pendingAction, confirmation)) {
      return {
        cancel: confirmation.type === "cancel",
        confirm: confirmation.type === "confirm",
      };
    }

    return {
      cancel: isCancellationReply(message),
      confirm: isBatchConfirmationReply(message),
    };
  }

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

export const restoreConfirmedBatchIntents = (
  pending: Extract<PendingAction, { type: "await_batch_confirmation" }>,
): AgentIntent[] => restoreIntentsFromBatchConfirmation(pending);
