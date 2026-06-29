import { restoreIntentsFromBatchConfirmation } from "../execution-graph";
import { isBatchConfirmationReply, isCancellationReply, isConfirmationReply } from "../intent-resolution";
import { createIntentFromProposedAction } from "../safety";
import type { AgentIntent, ComposeScheduleItemArgs, PendingAction, ProposedAgentAction, ScheduleProposal } from "../schemas";
import { isRecord } from "@/lib/shared/is-record";

export type StructuredConfirmation = {
  actionId: string;
  capability?: string;
  batch?: boolean;
  type: "cancel" | "confirm";
};

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
    ...(typeof raw.capability === "string" && raw.capability.trim()
      ? { capability: raw.capability.trim() }
      : {}),
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

export const getBatchReceiptActionId = (
  pending: Extract<PendingAction, { type: "await_batch_confirmation" }>,
) =>
  [
    "batch",
    pending.orchestrationId ?? "standalone",
    ...pending.actions.map((action) => action.id),
  ].join(":");

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

  const requiresStructuredConfirm =
    pendingAction.action.riskLevel === "high" || pendingAction.action.intent === "delete_record";

  if (confirmation) {
    if (confirmationMatchesPending(pendingAction, confirmation)) {
      return {
        cancel: confirmation.type === "cancel",
        confirm: confirmation.type === "confirm",
      };
    }
  }

  if (requiresStructuredConfirm) {
    return {
      cancel: isCancellationReply(message),
      confirm: false,
    };
  }

  return {
    cancel: isCancellationReply(message),
    confirm: isConfirmationReply(message),
  };
};

export const restoreConfirmedIntent = (action: ProposedAgentAction): AgentIntent => {
  const actionForRestore =
    action.intent === "compose_schedule_item" &&
    action.args &&
    typeof action.args === "object" &&
    !(action.args as ComposeScheduleItemArgs).proposal &&
    action.afterSnapshot &&
    typeof action.afterSnapshot === "object" &&
    "date" in action.afterSnapshot &&
    "title" in action.afterSnapshot
      ? {
          ...action,
          args: {
            ...(action.args as ComposeScheduleItemArgs),
            proposal: action.afterSnapshot as ScheduleProposal,
          },
        }
      : action;

  const confirmedIntent = createIntentFromProposedAction(actionForRestore);

  if (!confirmedIntent) {
    throw new Error("Pending confirmation action could not be restored.");
  }

  return confirmedIntent;
};

export const restoreConfirmedBatchIntents = (
  pending: Extract<PendingAction, { type: "await_batch_confirmation" }>,
): AgentIntent[] => restoreIntentsFromBatchConfirmation(pending);
