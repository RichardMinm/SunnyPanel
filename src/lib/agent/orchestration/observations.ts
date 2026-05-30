import type { AgentTraceStep, ProposedAgentAction } from "../schemas";
import type { AgentTaskObservation, TaskNode, TaskObservationStatus } from "./types";

const statusLabelMap: Record<TaskObservationStatus, string> = {
  answered: "已回答",
  auto_executed: "已自动执行",
  blocked: "已阻塞",
  clarified: "需澄清",
  executed: "已执行",
  failed: "执行失败",
  proposed: "待确认",
  skipped: "已跳过",
};

const uniqueCollections = (action: ProposedAgentAction) =>
  Array.from(new Set(action.changes.map((change) => change.collection).filter(Boolean)));

export const buildTaskObservation = (
  task: TaskNode,
  input: {
    action?: ProposedAgentAction;
    error?: string;
    message: string;
    status: TaskObservationStatus;
  },
): AgentTaskObservation => ({
  ...(input.action ? { actionId: input.action.id } : {}),
  agentRole: task.agentRole,
  ...(input.action ? { collections: uniqueCollections(input.action) } : {}),
  ...(input.error ? { error: input.error } : {}),
  intent: task.intent,
  label: task.label,
  message: input.message,
  ...(input.action ? { riskLevel: input.action.riskLevel } : {}),
  status: input.status,
  taskId: task.id,
});

export const formatTaskObservation = (observation: AgentTaskObservation): string => {
  const collections = observation.collections?.length ? ` · ${observation.collections.join(",")}` : "";
  const risk = observation.riskLevel ? ` · ${observation.riskLevel}` : "";
  const error = observation.error ? ` · ${observation.error}` : "";

  return `${statusLabelMap[observation.status]}「${observation.label}」${collections}${risk}：${observation.message}${error}`;
};

export const formatTaskObservations = (observations: AgentTaskObservation[]): string =>
  observations.map(formatTaskObservation).join("\n");

export type ObservationDecision =
  | {
      type: "continue";
    }
  | {
      failedTaskId: string;
      reason: string;
      type: "replan";
    };

const replanTriggerStatuses = new Set<TaskObservationStatus>(["blocked", "failed", "skipped"]);

export const decideNextActionFromObservations = (
  observations: AgentTaskObservation[],
  context: {
    canReplan: boolean;
    hasPendingProposals: boolean;
  },
): ObservationDecision => {
  if (!context.canReplan) {
    return { type: "continue" };
  }

  const blockingObservation = observations.find((observation) =>
    replanTriggerStatuses.has(observation.status),
  );

  if (!blockingObservation) {
    return { type: "continue" };
  }

  if (!context.hasPendingProposals && blockingObservation.status !== "blocked") {
    return { type: "continue" };
  }

  return {
    failedTaskId: blockingObservation.taskId,
    reason: blockingObservation.error ?? blockingObservation.message,
    type: "replan",
  };
};

export const buildObservationTraceStep = (observations: AgentTaskObservation[]): AgentTraceStep | null => {
  if (observations.length === 0) {
    return null;
  }

  return {
    detail: formatTaskObservations(observations),
    id: "orchestrator-observe",
    kind: "analysis",
    status: "done",
    title: `已观察 ${observations.length} 个子任务结果`,
  };
};
