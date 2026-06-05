import type { AgentPromptContext } from "../prompts";
import type { PendingAction, ProposedAgentAction } from "../schemas";
import type { AgentExecutionEvaluation, AgentTaskObservation, ExecutionQueueState } from "./types";
import { applyExecutionStrategy, selectExecutionStrategy } from "./strategy";

export type ExecutionEvaluationInput = {
  canReplan?: boolean;
  context?: AgentPromptContext;
  observations: AgentTaskObservation[];
  pendingAction: PendingAction | null;
  proposals: ProposedAgentAction[];
  queueState: ExecutionQueueState;
};

const collectAffectedDocuments = (observations: AgentTaskObservation[]): AgentExecutionEvaluation["affectedDocuments"] =>
  observations.flatMap((observation) => observation.affectedDocuments ?? []);

const firstBlockingObservation = (observations: AgentTaskObservation[]) =>
  observations.find(
    (observation) =>
      (observation.status === "failed" || observation.status === "blocked") && !observation.repairedByTaskId,
  );

const formatAffectedSummary = (documents: AgentExecutionEvaluation["affectedDocuments"]) => {
  if (documents.length === 0) {
    return "未记录实际文档变更";
  }

  return documents
    .map((document) => `${document.collection}#${document.documentId ?? "?"} ${document.operation}`)
    .join("；");
};

const proposalSummary = (proposals: ProposedAgentAction[], pendingAction: PendingAction | null) => {
  if (proposals.length > 0) {
    return proposals.map((proposal) => proposal.summary).join("；");
  }

  if (pendingAction?.type === "await_confirmation") {
    return pendingAction.action.summary;
  }

  if (pendingAction?.type === "await_batch_confirmation") {
    return pendingAction.actions.map((action) => action.summary).join("；");
  }

  return "待确认操作";
};

export const buildExecutionEvaluation = (input: ExecutionEvaluationInput): AgentExecutionEvaluation => {
  const affectedDocuments = collectAffectedDocuments(input.observations);
  const pendingAction = input.pendingAction;
  const blocking = firstBlockingObservation(input.observations);
  const finalize = (evaluation: Omit<AgentExecutionEvaluation, "strategy">): AgentExecutionEvaluation =>
    applyExecutionStrategy(
      evaluation,
      selectExecutionStrategy({
        context: input.context,
        evaluation,
        observations: input.observations,
      }),
    );

  if (blocking && input.canReplan) {
    return finalize({
      action: "replan",
      affectedDocuments,
      confidence: 0.88,
      deferredTaskIds: input.queueState.deferredTaskIds,
      failedTaskId: blocking.taskId,
      nextStep: "根据失败原因和执行观察重规划剩余任务。",
      reason: blocking.error ?? blocking.message,
      summary: `需要重规划「${blocking.label}」：${blocking.error ?? blocking.message}`,
    });
  }

  if (pendingAction?.type === "await_confirmation" || pendingAction?.type === "await_batch_confirmation") {
    const resumeQueue = pendingAction.resumeQueue;
    const deferredTaskIds = resumeQueue?.deferredTaskIds ?? input.queueState.deferredTaskIds;

    return finalize({
      action: "wait_for_confirmation",
      affectedDocuments,
      confidence: 0.94,
      deferredTaskIds,
      nextStep: resumeQueue
        ? `等待用户确认；确认后继续恢复 ${resumeQueue.deferredTaskIds.length} 个延后子任务。`
        : "等待用户确认后执行写操作。",
      reason: "存在需要用户确认的写操作。",
      summary: `待确认：${proposalSummary(input.proposals, pendingAction)}`,
    });
  }

  if (pendingAction?.type === "await_queue_resume") {
    return finalize({
      action: "resume_queue",
      affectedDocuments,
      confidence: 0.93,
      deferredTaskIds: pendingAction.deferredTaskIds,
      nextStep: `等待用户回复「继续」恢复 ${pendingAction.deferredTaskIds.length} 个延后子任务，或回复「取消」放弃。`,
      reason: "执行预算或确认边界导致部分子任务延后。",
      summary: `暂停等待继续：${pendingAction.deferredTaskIds.length} 个延后子任务`,
    });
  }

  if (blocking) {
    return finalize({
      action: "ask_user",
      affectedDocuments,
      confidence: 0.82,
      deferredTaskIds: input.queueState.deferredTaskIds,
      failedTaskId: blocking.taskId,
      nextStep: "向用户说明失败原因，并等待用户提供更明确的信息或手动处理。",
      reason: blocking.error ?? blocking.message,
      summary: `需要用户处理「${blocking.label}」：${blocking.error ?? blocking.message}`,
    });
  }

  if (input.queueState.pendingTaskIds.length > 0) {
    return finalize({
      action: "continue",
      affectedDocuments,
      confidence: 0.78,
      deferredTaskIds: input.queueState.deferredTaskIds,
      nextStep: "继续处理队列中的未完成子任务。",
      reason: "仍有未处理任务。",
      summary: `继续执行：还有 ${input.queueState.pendingTaskIds.length} 个未处理子任务`,
    });
  }

  return finalize({
    action: "complete",
    affectedDocuments,
    confidence: 0.9,
    deferredTaskIds: [],
    nextStep: "本轮目标已经处理完毕。",
    reason: `完成 ${input.queueState.completedTaskIds.length}/${input.queueState.totalTasks} 个子任务；影响 ${formatAffectedSummary(affectedDocuments)}。`,
    summary: "本轮执行完成",
  });
};
