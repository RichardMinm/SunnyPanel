import {
  upsertMemory,
  type AgentMemoryDocument,
  type AgentMemoryInput,
} from "../memory";
import type { AgentExecutionEvaluation, AgentTaskObservation } from "./types";

export type StrategyFeedbackMemoryInput = {
  evaluation: AgentExecutionEvaluation;
  observations: AgentTaskObservation[];
  originalMessage: string;
};

export type StrategyFeedbackMemoryDeps = {
  upsertMemory?: (memory: AgentMemoryInput) => Promise<AgentMemoryDocument>;
};

const truncate = (value: string, maxLength: number) => {
  const normalized = value.trim().replace(/\s+/g, " ");

  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength).trimEnd()}...`;
};

const getFeedbackObservation = (input: StrategyFeedbackMemoryInput) =>
  input.observations.find((observation) => observation.taskId === input.evaluation.failedTaskId) ??
  input.observations.find((observation) => observation.status === "failed" || observation.status === "blocked");

export const buildStrategyFeedbackMemoryDraft = (
  input: StrategyFeedbackMemoryInput,
): AgentMemoryInput | null => {
  const strategy = input.evaluation.strategy;

  if (strategy.mode !== "avoid_recent_failure" || strategy.recentRunIds.length < 2) {
    return null;
  }

  const observation = getFeedbackObservation(input);
  const workflow = observation?.intent ?? input.evaluation.failedTaskId ?? "unknown_workflow";
  const failedLabel = observation?.label ?? input.evaluation.failedTaskId ?? workflow;
  const failureReason = truncate(input.evaluation.reason, 160);
  const originalMessage = truncate(input.originalMessage, 120);
  const confidence = Math.min(0.9, 0.74 + strategy.recentRunIds.length * 0.04);

  return {
    confidence,
    content: [
      `当 ${workflow} 处理「${originalMessage}」失败，并且最近同类 AgentRun 已失败 ${strategy.recentRunIds.length} 次时，不要直接重复自动重规划。`,
      `失败信号：${failedLabel} · ${failureReason}。`,
      "下一次先核对目标对象、参数和上下文；必要时询问用户，或改用增量替代步骤。",
    ].join(" "),
    sourceRun: strategy.recentRunIds[0],
    status: "active",
    title: `策略反馈：${workflow}`,
    type: "workflow_rule",
    visibility: "private",
  };
};

export const autoArchiveStrategyFeedbackMemory = async (
  input: StrategyFeedbackMemoryInput,
  deps: StrategyFeedbackMemoryDeps = {},
) => {
  const memory = buildStrategyFeedbackMemoryDraft(input);

  if (!memory) {
    return null;
  }

  return (deps.upsertMemory ?? upsertMemory)(memory);
};
