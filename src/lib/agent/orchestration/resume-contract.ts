import {
  parseAgentIntentResult,
  type AgentIntent,
  type AgentQueueResumePendingAction,
  type AgentStrategyResumePendingAction,
  type PendingAction,
} from "@/lib/agent/schemas";
import type {
  ExecutionGraphResult,
  OrchestratorPlan,
  TaskNode,
} from "@/lib/agent/orchestration/types";

const serializeTasksForPendingAction = (tasks: TaskNode[]) =>
  tasks.map((task) => ({
    agentRole: task.agentRole,
    args: task.args,
    dependsOn: task.dependsOn,
    id: task.id,
    intent: task.intent,
    label: task.label,
  }));

export const buildResumedOrchestratorPlan = (
  pending: AgentQueueResumePendingAction,
): OrchestratorPlan => {
  const deferredIds = new Set(pending.deferredTaskIds);
  const completedIds = new Set(pending.completedTaskIds);
  const tasks: TaskNode[] = pending.tasks
    .filter((task) => deferredIds.has(task.id))
    .map((task) => ({
      agentRole: task.agentRole,
      args: task.args,
      dependsOn: task.dependsOn.filter(
        (dependencyId) =>
          deferredIds.has(dependencyId) &&
          !completedIds.has(dependencyId),
      ),
      id: task.id,
      intent: task.intent,
      label: task.label,
    }));

  return {
    mode: pending.mode,
    reasoning: pending.reasoning
      ? `继续执行：${pending.reasoning}`
      : "继续执行已延后的子任务。",
    tasks,
  };
};

export const buildStrategyResumePendingAction = ({
  evaluation,
  message,
  orchestrationId,
  plan,
}: {
  evaluation: ExecutionGraphResult["evaluation"];
  message: string;
  orchestrationId: string;
  plan: OrchestratorPlan;
}): AgentStrategyResumePendingAction | null => {
  const originalMessage = message.trim();

  if (!originalMessage) return null;

  return {
    failedTaskId: evaluation.failedTaskId,
    failureReason: evaluation.reason,
    mode: plan.mode,
    orchestrationId,
    originalMessage,
    reason: evaluation.strategy.reason,
    reasoning: plan.reasoning,
    recentRunIds: evaluation.strategy.recentRunIds,
    strategyMode: evaluation.strategy.mode,
    tasks: serializeTasksForPendingAction(plan.tasks),
    type: "await_strategy_resume",
  };
};

export const buildStrategyResumeOrchestratorPlan = (
  pending: AgentStrategyResumePendingAction,
): OrchestratorPlan => ({
  mode: pending.mode,
  reasoning: pending.reasoning
    ? `换策略继续：${pending.reasoning}`
    : "换策略继续已暂停的编排任务。",
  tasks: pending.tasks.map((task) => ({
    agentRole: task.agentRole,
    args: task.args,
    dependsOn: task.dependsOn,
    id: task.id,
    intent: task.intent,
    label: task.label,
  })),
});

export const restoreIntentsFromBatchConfirmation = (
  pending: Extract<PendingAction, { type: "await_batch_confirmation" }>,
): AgentIntent[] => {
  const intents = pending.actions
    .map((action) =>
      parseAgentIntentResult({
        args: action.args,
        confidence: 1,
        intent: action.intent,
      }),
    )
    .filter((intent): intent is AgentIntent => intent !== null);

  if (intents.length !== pending.actions.length) {
    throw new Error(
      `批量确认恢复失败：${pending.actions.length} 项操作中仅有 ${intents.length} 项可解析为有效意图。`,
    );
  }

  return intents;
};
