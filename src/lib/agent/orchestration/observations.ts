import type { AgentTraceStep, ProposedAgentAction } from "../schemas";
import { parseRollbackPayload } from "../rollback-parse";
import { buildExecutionEvaluation } from "./evaluation";
import type {
  AgentTaskObservation,
  ExecutionGraphResult,
  ExecutionQueueState,
  TaskNode,
  TaskObservationStatus,
} from "./types";
import {
  getSafeExecutionFailure,
  type SafeExecutionFailureCode,
} from "./safe-execution-failure";

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

type AffectedDocument = NonNullable<AgentTaskObservation["affectedDocuments"]>[number];

const operationFromRollbackStrategy = (strategy: string): AffectedDocument["operation"] => {
  if (
    strategy === "delete_created_document" ||
    strategy === "delete_created_documents" ||
    strategy === "delete_created_timeline_event" ||
    strategy === "archive_created_memory"
  ) {
    return "create";
  }

  return "update";
};

export const deriveAffectedDocumentsFromRollbackPayload = (rollbackPayload: unknown): AffectedDocument[] => {
  const parsed = parseRollbackPayload(rollbackPayload);

  if (!parsed?.target?.collection) {
    return [];
  }

  const { collection, documentId, documentIds } = parsed.target;
  const operation = operationFromRollbackStrategy(parsed.strategy);

  if (Array.isArray(documentIds) && documentIds.length > 0) {
    return documentIds.map((id) => ({
      collection,
      documentId: id,
      operation,
      rollbackStrategy: parsed.strategy,
    }));
  }

  if (typeof documentId === "number") {
    return [
      {
        collection,
        documentId,
        operation,
        rollbackStrategy: parsed.strategy,
      },
    ];
  }

  return [];
};

export const buildTaskObservation = (
  task: TaskNode,
  input: {
    action?: ProposedAgentAction;
    affectedDocuments?: AgentTaskObservation["affectedDocuments"];
    error?: string;
    errorCode?: SafeExecutionFailureCode;
    message: string;
    rollbackPayload?: unknown;
    status: TaskObservationStatus;
  },
): AgentTaskObservation => {
  const failure = input.status === "failed"
    ? getSafeExecutionFailure(input.errorCode)
    : null;
  const affectedDocuments =
    input.affectedDocuments ??
    (input.rollbackPayload ? deriveAffectedDocumentsFromRollbackPayload(input.rollbackPayload) : []);
  const collections = Array.from(
    new Set([
      ...(input.action ? uniqueCollections(input.action) : []),
      ...affectedDocuments.map((document) => document.collection),
    ]),
  );

  return {
    ...(input.action ? { actionId: input.action.id } : {}),
    ...(affectedDocuments.length > 0 ? { affectedDocuments } : {}),
    agentRole: task.agentRole,
    ...(collections.length > 0 ? { collections } : {}),
    ...(failure
      ? { error: failure.safeReplanReason, errorCode: failure.code }
      : input.error
        ? { error: input.error }
        : {}),
    intent: task.intent,
    label: task.label,
    message: failure?.safeObservationMessage ?? input.message,
    ...(input.action ? { riskLevel: input.action.riskLevel } : {}),
    ...(affectedDocuments.length > 0 ? { rollbackAvailable: true } : {}),
    status: input.status,
    taskId: task.id,
  };
};

export const formatTaskObservation = (observation: AgentTaskObservation): string => {
  const failure = observation.status === "failed"
    ? getSafeExecutionFailure(observation.errorCode)
    : null;
  const collections = observation.collections?.length ? ` · ${observation.collections.join(",")}` : "";
  const risk = observation.riskLevel ? ` · ${observation.riskLevel}` : "";
  const affected = observation.affectedDocuments?.length
    ? ` · 影响 ${observation.affectedDocuments
        .map((document) => `${document.collection}#${document.documentId ?? "?"} ${document.operation}`)
        .join("；")}`
    : "";
  const error = failure
    ? ` · ${failure.safeReplanReason}`
    : observation.error
      ? ` · ${observation.error}`
      : "";

  return `${statusLabelMap[observation.status]}「${observation.label}」${collections}${risk}${affected}：${failure?.safeObservationMessage ?? observation.message}${error}`;
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
    reason: getSafeExecutionFailure(
      blockingObservation.errorCode,
    ).safeReplanReason,
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

const formatQueueCounts = (state: ExecutionQueueState) =>
  [
    `总计 ${state.totalTasks} 项`,
    state.completedTaskIds.length > 0 ? `已完成 ${state.completedTaskIds.length} 项` : null,
    state.proposedTaskIds.length > 0 ? `待确认 ${state.proposedTaskIds.length} 项` : null,
    state.deferredTaskIds.length > 0 ? `延后 ${state.deferredTaskIds.length} 项` : null,
    state.failedTaskIds.length > 0 ? `失败 ${state.failedTaskIds.length} 项` : null,
    state.blockedTaskIds.length > 0 ? `阻塞 ${state.blockedTaskIds.length} 项` : null,
    state.pendingTaskIds.length > 0 ? `未处理 ${state.pendingTaskIds.length} 项` : null,
  ]
    .filter(Boolean)
    .join("，");

type ExecutionDecisionTraceInput = Omit<ExecutionGraphResult, "evaluation"> & Partial<Pick<ExecutionGraphResult, "evaluation">>;

export const buildExecutionDecisionTraceStep = (result: ExecutionDecisionTraceInput): AgentTraceStep => {
  const pendingAction = result.pendingAction;
  const queueSummary = formatQueueCounts(result.queueState);
  const proposalSummary = result.proposals.length > 0 ? `待确认操作：${result.proposals.map((action) => action.summary).join("；")}` : null;
  const evaluation =
    result.evaluation ??
    buildExecutionEvaluation({
      observations: result.observations,
      pendingAction: result.pendingAction,
      proposals: result.proposals,
      queueState: result.queueState,
    });
  const evaluationDetail = `执行评估：${evaluation.summary}\n下一步：${evaluation.nextStep}`;

  if (pendingAction?.type === "await_confirmation") {
    const resumeNote = pendingAction.resumeQueue
      ? `确认后可继续恢复 ${pendingAction.resumeQueue.deferredTaskIds.length} 个延后子任务。`
      : "确认后执行当前动作。";

    return {
      detail: [queueSummary, proposalSummary, evaluationDetail, resumeNote].filter(Boolean).join("\n"),
      id: "orchestrator-decision",
      kind: "analysis",
      status: "done",
      title: pendingAction.resumeQueue ? "决策：等待确认后继续" : "决策：等待单步确认",
    };
  }

  if (pendingAction?.type === "await_batch_confirmation") {
    const resumeNote = pendingAction.resumeQueue
      ? `批量确认后可继续恢复 ${pendingAction.resumeQueue.deferredTaskIds.length} 个延后子任务。`
      : "批量确认后执行这些动作。";

    return {
      detail: [queueSummary, proposalSummary, evaluationDetail, resumeNote].filter(Boolean).join("\n"),
      id: "orchestrator-decision",
      kind: "analysis",
      status: "done",
      title: pendingAction.resumeQueue ? "决策：等待批量确认后继续" : "决策：等待批量确认",
    };
  }

  if (pendingAction?.type === "await_queue_resume") {
    return {
      detail: [queueSummary, evaluationDetail, `回复「继续」恢复 ${pendingAction.deferredTaskIds.length} 个延后子任务，或回复「取消」放弃。`].join("\n"),
      id: "orchestrator-decision",
      kind: "analysis",
      status: "done",
      title: "决策：暂停等待继续",
    };
  }

  if (pendingAction?.type === "await_strategy_resume") {
    return {
      detail: [
        queueSummary,
        evaluationDetail,
        `策略：${pendingAction.strategyMode}`,
        `回复「继续」换策略重试，或回复「取消」放弃。`,
      ].join("\n"),
      id: "orchestrator-decision",
      kind: "analysis",
      status: "done",
      title: "决策：策略暂停等待继续",
    };
  }

  if (result.queueState.failedTaskIds.length > 0 || result.queueState.blockedTaskIds.length > 0) {
    return {
      detail: [queueSummary, evaluationDetail].join("\n"),
      id: "orchestrator-decision",
      kind: "analysis",
      status: "done",
      title: "决策：等待用户处理",
    };
  }

  return {
    detail: [queueSummary, evaluationDetail].join("\n"),
    id: "orchestrator-decision",
    kind: "analysis",
    status: "done",
    title: "决策：本轮完成",
  };
};
