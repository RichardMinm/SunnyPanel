import type { AgentTraceStep, ProposedAgentAction } from "../schemas";
import type { AgentTaskObservation, ExecutionQueueState, TaskNode, TaskObservationStatus } from "./types";

const statusLabelMap: Record<TaskObservationStatus, string> = {
  answered: "已回答",
  auto_executed: "已自动执行",
  blocked: "已阻塞",
  clarified: "需澄清",
  deferred: "已延后",
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

const completedStatuses = new Set<TaskObservationStatus>(["answered", "auto_executed", "executed"]);

const latestObservationByTask = (observations: AgentTaskObservation[]) => {
  const byTask = new Map<string, AgentTaskObservation>();

  for (const observation of observations) {
    byTask.set(observation.taskId, observation);
  }

  return byTask;
};

export const summarizeExecutionQueue = (
  tasks: TaskNode[],
  observations: AgentTaskObservation[],
): ExecutionQueueState => {
  const byTask = latestObservationByTask(observations);
  const state: ExecutionQueueState = {
    autoExecutedTaskIds: [],
    blockedTaskIds: [],
    completedTaskIds: [],
    deferredTaskIds: [],
    failedTaskIds: [],
    pendingTaskIds: [],
    proposedTaskIds: [],
    skippedTaskIds: [],
    totalTasks: tasks.length,
  };

  for (const task of tasks) {
    const observation = byTask.get(task.id);

    if (!observation) {
      state.pendingTaskIds.push(task.id);
      continue;
    }

    if (completedStatuses.has(observation.status)) {
      state.completedTaskIds.push(task.id);
    }

    if (observation.status === "auto_executed") {
      state.autoExecutedTaskIds.push(task.id);
    } else if (observation.status === "blocked") {
      state.blockedTaskIds.push(task.id);
    } else if (observation.status === "deferred") {
      state.deferredTaskIds.push(task.id);
    } else if (observation.status === "failed") {
      state.failedTaskIds.push(task.id);
    } else if (observation.status === "proposed") {
      state.proposedTaskIds.push(task.id);
    } else if (observation.status === "skipped") {
      state.skippedTaskIds.push(task.id);
    }
  }

  return state;
};

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
