import { isRecord } from "@/lib/shared/is-record";

import type { AgentChatMessage, PendingAction } from "../schemas";
import {
  sanitizeChecklistDraft,
  type ChecklistDraft,
} from "./checklist-draft";
import type { PlanDraft, PlanDraftStage } from "./draft";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isNonEmptyString);

const isOptionalString = (value: unknown): value is null | string | undefined =>
  value == null || typeof value === "string";

const isOptionalStringList = (value: unknown): value is string[] | undefined =>
  value === undefined || isStringList(value);

const isPlanDraftStage = (value: unknown): value is PlanDraftStage => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.title) &&
    isStringList(value.tasks) &&
    isOptionalString(value.description) &&
    isOptionalString(value.startDate) &&
    isOptionalString(value.endDate)
  );
};

export const isPlanDraft = (value: unknown): value is PlanDraft => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.goal) &&
    isOptionalString(value.deadline) &&
    isOptionalString(value.scope) &&
    isOptionalString(value.currentProgress) &&
    isOptionalString(value.availableTime) &&
    isOptionalString(value.successCriteria) &&
    Array.isArray(value.stages) &&
    value.stages.length > 0 &&
    value.stages.every(isPlanDraftStage) &&
    isOptionalStringList(value.risks) &&
    isOptionalStringList(value.assumptions) &&
    isOptionalStringList(value.nextActions)
  );
};

export const extractPlanningDraftFromSessionState = (sessionState: unknown): PlanDraft | null => {
  if (!isRecord(sessionState) || !isRecord(sessionState.planning)) {
    return null;
  }

  return isPlanDraft(sessionState.planning.draft) ? sessionState.planning.draft : null;
};

export const extractPlanningChecklistDraftFromSessionState = (
  sessionState: unknown,
): ChecklistDraft | null => {
  if (!isRecord(sessionState) || !isRecord(sessionState.planning)) {
    return null;
  }

  return sanitizeChecklistDraft(sessionState.planning.checklistDraft) ?? null;
};

export const attachPlanningDraftToLastAssistantMessage = (
  messages: AgentChatMessage[],
  draft: null | PlanDraft | undefined,
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
      planningDraft: draft,
    };

    return nextMessages;
  }

  return cleanedMessages;
};

export const attachPlanningChecklistDraftToLastAssistantMessage = (
  messages: AgentChatMessage[],
  draft: ChecklistDraft | null | undefined,
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
      planningChecklistDraft: draft,
    };

    return nextMessages;
  }

  return cleanedMessages;
};
