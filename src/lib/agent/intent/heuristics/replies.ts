import type { PendingAction } from "../../schemas";
import { cancellationReplyKeywords, confirmationReplyKeywords, negativeReplyKeywords } from "./keywords";
import { cleanupText } from "./shared-text";

export const isNegativeReply = (message: string) => {
  const normalized = cleanupText(message);

  return negativeReplyKeywords.some((keyword) => normalized.includes(keyword));
};

export const isConfirmationReply = (message: string) => {
  const normalized = cleanupText(message).replace(/\s+/g, "");

  if (confirmationReplyKeywords.includes(normalized)) {
    return true;
  }

  if (isCancellationReply(message) || isNegativeReply(message)) {
    return false;
  }

  return confirmationReplyKeywords.some((keyword) => normalized.includes(keyword));
};

export const isCancellationReply = (message: string) => {
  const normalized = cleanupText(message).replace(/\s+/g, "");

  return cancellationReplyKeywords.some((keyword) => normalized.includes(keyword)) || isNegativeReply(message);
};

export const shouldSkipPendingAction = (
  pendingAction: null | PendingAction,
  message: string,
): pendingAction is Exclude<PendingAction, { type: "await_confirmation" }> =>
  Boolean(pendingAction && pendingAction.type !== "await_confirmation" && isNegativeReply(message));
