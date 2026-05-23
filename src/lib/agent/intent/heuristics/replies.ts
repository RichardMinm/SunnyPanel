import type { PendingAction } from "../../schemas";
import { cancellationReplyKeywords, confirmationReplyKeywords, negativeReplyKeywords } from "./keywords";
import { cleanupText } from "./shared-text";

export const isNegativeReply = (message: string) => {
  const normalized = cleanupText(message);

  return negativeReplyKeywords.some((keyword) => normalized.includes(keyword));
};

export const isExactConfirmationReply = (message: string) => {
  const normalized = cleanupText(message).replace(/\s+/g, "");

  return confirmationReplyKeywords.includes(normalized);
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

/** 批量确认场景：仅接受精确确认词，避免「好的，再加一条」误触整批执行。 */
export const isBatchConfirmationReply = (message: string) => isExactConfirmationReply(message);

export const isCancellationReply = (message: string) => {
  const normalized = cleanupText(message).replace(/\s+/g, "");

  return cancellationReplyKeywords.some((keyword) => normalized.includes(keyword)) || isNegativeReply(message);
};

export const shouldSkipPendingAction = (
  pendingAction: null | PendingAction,
  message: string,
): pendingAction is Exclude<PendingAction, { type: "await_confirmation" | "await_batch_confirmation" }> =>
  Boolean(
    pendingAction &&
      pendingAction.type !== "await_confirmation" &&
      pendingAction.type !== "await_batch_confirmation" &&
      isNegativeReply(message),
  );
