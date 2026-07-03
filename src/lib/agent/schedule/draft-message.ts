import { isRecord } from "@/lib/shared/is-record";

import type { AgentChatMessage, PendingAction } from "../schemas";
import type { ScheduleDraft, ScheduleDraftItem } from "./draft";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isOptionalString = (value: unknown): value is null | string | undefined =>
  value == null || typeof value === "string";

const isOptionalPositiveNumber = (value: unknown): value is null | number | undefined =>
  value == null || (typeof value === "number" && Number.isFinite(value) && value > 0);

const isOptionalStringList = (value: unknown): value is string[] | undefined =>
  value === undefined || (Array.isArray(value) && value.every(isNonEmptyString));

const isScheduleDraftItem = (value: unknown): value is ScheduleDraftItem => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.title) &&
    isOptionalString(value.sourceTaskTitle) &&
    isOptionalString(value.date) &&
    isOptionalString(value.startTime) &&
    isOptionalString(value.endTime) &&
    isOptionalPositiveNumber(value.estimatedMinutes) &&
    isOptionalPositiveNumber(value.sourcePlanId) &&
    isOptionalPositiveNumber(value.sourceChecklistId) &&
    isOptionalString(value.sourceChecklistItemKey) &&
    isOptionalString(value.conflictNote)
  );
};

export const isScheduleDraft = (value: unknown): value is ScheduleDraft => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.title) &&
    (value.sourceType === "plan" || value.sourceType === "checklist" || value.sourceType === "manual") &&
    isOptionalPositiveNumber(value.sourcePlanId) &&
    isOptionalPositiveNumber(value.sourceChecklistId) &&
    Array.isArray(value.items) &&
    value.items.length > 0 &&
    value.items.every(isScheduleDraftItem) &&
    isOptionalStringList(value.assumptions) &&
    isOptionalStringList(value.conflicts) &&
    isOptionalStringList(value.nextActions)
  );
};

export const extractSchedulingDraftFromSessionState = (sessionState: unknown): ScheduleDraft | null => {
  if (!isRecord(sessionState) || !isRecord(sessionState.scheduling)) {
    return null;
  }

  return isScheduleDraft(sessionState.scheduling.draft) ? sessionState.scheduling.draft : null;
};

export const attachSchedulingDraftToLastAssistantMessage = (
  messages: AgentChatMessage[],
  draft: null | ScheduleDraft | undefined,
  pendingAction: null | PendingAction | undefined,
): AgentChatMessage[] => {
  const cleanedMessages: AgentChatMessage[] = messages.map((message) => ({
    content: message.content,
    role: message.role,
  }));

  if (!draft || pendingAction) {
    return cleanedMessages;
  }

  for (let index = cleanedMessages.length - 1; index >= 0; index -= 1) {
    const message = cleanedMessages[index];

    if (message.role !== "assistant") {
      continue;
    }

    const nextMessages = [...cleanedMessages];
    nextMessages[index] = {
      ...message,
      schedulingDraft: draft,
    };

    return nextMessages;
  }

  return cleanedMessages;
};
