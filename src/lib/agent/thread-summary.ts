import type { AgentThread } from "@/payload-types";

import type { AgentChatMessage, PendingAction } from "./schemas";

export const THREAD_SUMMARY_MIN_MESSAGES = 8;
export const THREAD_SUMMARY_REFRESH_DELTA = 4;
const maxSummaryChars = 1600;

export type AgentThreadSummaryFields = {
  summary?: null | string;
  summaryMessageCount?: null | number;
  summaryUpdatedAt?: null | string;
};

export type AgentPromptThreadSummary = {
  messageCount: number;
  summary: string;
  updatedAt: null | string;
};

const normalizeText = (value: string) => value.trim().replace(/\s+/g, " ");

const truncateText = (value: string, maxLength: number) => {
  const normalized = normalizeText(value);

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trimEnd()}...` : normalized;
};

const takeLast = <TValue>(values: TValue[], count: number) => values.slice(Math.max(0, values.length - count));

const formatMessageLine = (message: AgentChatMessage) =>
  `${message.role === "user" ? "用户" : "Agent"}：${truncateText(message.content, 140)}`;

const summarizePendingAction = (pendingAction: null | PendingAction) => {
  if (!pendingAction) {
    return "无";
  }

  if (pendingAction.type === "await_queue_resume") {
    return `await_queue_resume，已完成 ${pendingAction.completedTaskIds.length} 项，待继续 ${pendingAction.deferredTaskIds.length} 项，reasoning=${truncateText(pendingAction.reasoning, 120)}`;
  }

  if (pendingAction.type === "await_strategy_resume") {
    return `await_strategy_resume，strategy=${pendingAction.strategyMode}，failedTask=${pendingAction.failedTaskId ?? "unknown"}，recentRuns=${pendingAction.recentRunIds.join("、") || "无"}，reason=${truncateText(pendingAction.reason, 120)}`;
  }

  if (pendingAction.type === "await_batch_confirmation") {
    return `await_batch_confirmation，等待确认 ${pendingAction.actions.length} 项，摘要=${truncateText(
      pendingAction.actions.map((action) => action.summary).join("；"),
      160,
    )}`;
  }

  if (pendingAction.type === "await_confirmation") {
    return `await_confirmation，intent=${pendingAction.action.intent}，summary=${truncateText(
      pendingAction.action.summary,
      160,
    )}`;
  }

  if (pendingAction.type === "await_clarification") {
    return `await_clarification，intent=${pendingAction.intent}，question=${truncateText(pendingAction.question, 160)}`;
  }

  if (pendingAction.type === "await_learning_followup") {
    return `await_learning_followup，subject=${pendingAction.subject}，original=${truncateText(pendingAction.originalMessage, 160)}`;
  }

  return `await_completion_note，target=${truncateText(
    [pendingAction.checklistTitle, pendingAction.groupTitle, pendingAction.itemTitle].filter(Boolean).join(" / "),
    160,
  )}`;
};

export const shouldRefreshAgentThreadSummary = ({
  messageCount,
  previousMessageCount,
}: {
  messageCount: number;
  previousMessageCount?: null | number;
}) => {
  if (messageCount < THREAD_SUMMARY_MIN_MESSAGES) {
    return false;
  }

  if (typeof previousMessageCount !== "number" || previousMessageCount <= 0) {
    return true;
  }

  return messageCount - previousMessageCount >= THREAD_SUMMARY_REFRESH_DELTA;
};

export const buildAgentThreadSummary = ({
  messages,
  pendingAction,
  previousSummary,
}: {
  messages: AgentChatMessage[];
  pendingAction: null | PendingAction;
  previousSummary?: null | string;
}) => {
  const normalizedMessages = messages
    .map((message) => ({
      content: normalizeText(message.content),
      role: message.role,
    }))
    .filter((message) => message.content.length > 0);
  const userMessages = normalizedMessages.filter((message) => message.role === "user");
  const assistantMessages = normalizedMessages.filter((message) => message.role === "assistant");
  const firstGoal = userMessages[0]?.content;
  const recentGoals = takeLast(userMessages, 3).map((message) => truncateText(message.content, 160));
  const recentOutcomes = takeLast(assistantMessages, 2).map((message) => truncateText(message.content, 180));
  const recentContext = takeLast(normalizedMessages, 6).map(formatMessageLine);
  const lines = [
    "自动线程摘要：",
    previousSummary ? `- 既有摘要：${truncateText(previousSummary, 260)}` : null,
    firstGoal ? `- 初始目标：${truncateText(firstGoal, 180)}` : null,
    recentGoals.length > 0 ? `- 近期用户目标：${recentGoals.join("；")}` : null,
    recentOutcomes.length > 0 ? `- 近期 Agent 结果：${recentOutcomes.join("；")}` : null,
    `- 待处理动作：${summarizePendingAction(pendingAction)}`,
    recentContext.length > 0 ? `- 最近上下文：${recentContext.join(" / ")}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    messageCount: normalizedMessages.length,
    summary: truncateText(lines.join("\n"), maxSummaryChars),
  };
};

export const toPromptThreadSummary = (
  thread: AgentThreadSummaryFields | Pick<AgentThread, "id">,
): AgentPromptThreadSummary | null => {
  const fields = thread as AgentThreadSummaryFields;
  const summary = typeof fields.summary === "string" ? fields.summary.trim() : "";

  if (!summary) {
    return null;
  }

  return {
    messageCount: typeof fields.summaryMessageCount === "number" ? fields.summaryMessageCount : 0,
    summary,
    updatedAt: typeof fields.summaryUpdatedAt === "string" ? fields.summaryUpdatedAt : null,
  };
};
