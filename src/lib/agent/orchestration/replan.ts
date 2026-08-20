import type { AgentPromptContext } from "../prompts";
import type { ProposedAgentAction } from "../schemas";
import { formatTaskObservations } from "./observations";
import {
  dispatchOrchestratorResult,
  type OrchestratorService,
} from "./orchestrator-dispatcher";
import type { OrchestratorFailureReason } from "./langchain-orchestrator";
import type { ModelCallBudgetRecorder } from "./model-call-budget";
import {
  coerceSafeReplanReason,
  getSafeExecutionFailure,
} from "./safe-execution-failure";
import type { AgentTaskObservation, ExecutionQueueState, OrchestratorPlan, TaskNode } from "./types";

export type { OrchestratorService } from "./orchestrator-dispatcher";

export type ReplanResult =
  | { status: "success"; plan: OrchestratorPlan }
  | {
      status: "unavailable";
      reason: OrchestratorFailureReason;
      safeMessage: string;
    };

export type ReplanStrategy = "local" | "incremental" | "global";

export type ReplanInput = {
  failedTask: TaskNode;
  failedTaskIndex: number;
  failureReason: string;
  failureType: "dependency_failure" | "missing_info" | "parse_error" | "timeout" | "tool_error";
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  observations?: AgentTaskObservation[];
  originalPlan: OrchestratorPlan;
  proposals?: ProposedAgentAction[];
  promptContext: AgentPromptContext;
  queueState?: ExecutionQueueState;
  strategyNote?: string;
  strategyOverride?: ReplanStrategy;
};

const FAILURE_TYPE_LABELS: Record<ReplanInput["failureType"], string> = {
  dependency_failure: "依赖解析失败",
  missing_info: "信息不完整",
  parse_error: "解析错误",
  timeout: "执行超时",
  tool_error: "工具执行错误",
};

const getSafeReplanFailureReason = (input: ReplanInput): string => {
  if (input.failureType === "tool_error") {
    const failedObservation = input.observations?.find(
      (observation) =>
        observation.taskId === input.failedTask.id && observation.status === "failed",
    );
    return failedObservation?.errorCode
      ? getSafeExecutionFailure(failedObservation.errorCode).safeReplanReason
      : coerceSafeReplanReason(input.failureReason);
  }

  const reasons: Record<Exclude<ReplanInput["failureType"], "tool_error">, string> = {
    dependency_failure: "dependency_failure: 子任务依赖未满足，未继续执行。",
    missing_info: "missing_info: 执行所需信息不足，需要补充后继续。",
    parse_error: "parse_error: 子任务无法安全解析，未执行后续操作。",
    timeout: "timeout: 子任务未在限定时间内完成，当前状态已保留。",
  };

  return reasons[input.failureType];
};

const projectObservationForReplan = (
  observation: AgentTaskObservation,
): AgentTaskObservation => {
  if (observation.status !== "failed") {
    return observation;
  }

  const failure = getSafeExecutionFailure(observation.errorCode);
  return {
    ...observation,
    error: failure.safeReplanReason,
    errorCode: failure.code,
    message: failure.safeObservationMessage,
  };
};

const formatQueueState = (state?: ExecutionQueueState) => {
  if (!state) {
    return "队列状态：未记录";
  }

  return [
    `队列状态：总计 ${state.totalTasks} 项`,
    state.completedTaskIds.length > 0 ? `已完成 ${state.completedTaskIds.length} 项` : null,
    state.proposedTaskIds.length > 0 ? `待确认 ${state.proposedTaskIds.length} 项` : null,
    state.deferredTaskIds.length > 0 ? `延后 ${state.deferredTaskIds.length} 项` : null,
    state.failedTaskIds.length > 0 ? `失败 ${state.failedTaskIds.length} 项` : null,
    state.blockedTaskIds.length > 0 ? `阻塞 ${state.blockedTaskIds.length} 项` : null,
    state.pendingTaskIds.length > 0 ? `未处理 ${state.pendingTaskIds.length} 项` : null,
    state.skippedTaskIds.length > 0 ? `跳过 ${state.skippedTaskIds.length} 项` : null,
    state.autoExecutedTaskIds.length > 0 ? `自动执行 ${state.autoExecutedTaskIds.length} 项` : null,
  ]
    .filter(Boolean)
    .join("，");
};

const formatProposals = (proposals?: ProposedAgentAction[]) => {
  if (!proposals?.length) {
    return "待确认操作：无";
  }

  const proposalLines = proposals.map((proposal) => {
    const collections = Array.from(new Set(proposal.changes.map((change) => change.collection))).join(",");

    return `${proposal.summary} | risk=${proposal.riskLevel}${collections ? ` | collections=${collections}` : ""}`;
  });

  return proposalLines.length === 1
    ? `待确认操作：${proposalLines[0]}`
    : ["待确认操作：", ...proposalLines.map((line) => `- ${line}`)].join("\n");
};

export const buildReplanExecutionSnapshot = (input: ReplanInput) => {
  const observations = input.observations?.length
    ? formatTaskObservations(input.observations.map(projectObservationForReplan))
    : "暂无执行观察。";

  return [
    "## 执行观察快照",
    observations,
    formatQueueState(input.queueState),
    formatProposals(input.proposals),
  ].join("\n");
};

export const decideReplanStrategy = (input: ReplanInput): ReplanStrategy => {
  const remainingCount = input.originalPlan.tasks.length - input.failedTaskIndex - 1;

  if (input.failureType === "dependency_failure") {
    // Count orphaned tasks (tasks that depend on the failed task)
    const orphaned = input.originalPlan.tasks.filter(
      (task) => task.dependsOn.includes(input.failedTask.id),
    ).length;

    return orphaned > 2 ? "global" : "incremental";
  }

  if (input.failureType === "missing_info") {
    return "incremental";
  }

  if (input.failureType === "parse_error") {
    return "incremental";
  }

  if (input.failureType === "tool_error") {
    return remainingCount <= 1 ? "local" : "incremental";
  }

  if (input.failureType === "timeout") {
    return "local";
  }

  return "incremental";
};

const replanLocal = (input: ReplanInput): OrchestratorPlan => {
  const tasks = [...input.originalPlan.tasks];
  const failedIndex = tasks.findIndex((t) => t.id === input.failedTask.id);
  const failureReason = getSafeReplanFailureReason(input);

  if (failedIndex === -1) {
    return input.originalPlan;
  }

  tasks[failedIndex] = {
    ...input.originalPlan.tasks[failedIndex],
    args: {
      ...input.originalPlan.tasks[failedIndex].args,
      _errorContext: failureReason,
      _replanAttempt: true,
    },
  };

  return {
    mode: input.originalPlan.mode,
    reasoning: `局部重试「${input.failedTask.label}」：${failureReason.slice(0, 80)}`,
    tasks,
  };
};

export const buildIncrementalReplanMessage = (input: ReplanInput) => {
  const failedLabel = input.failedTask.label;
  const failureLabel = FAILURE_TYPE_LABELS[input.failureType];
  const failureReason = getSafeReplanFailureReason(input);
  const completedLabels = input.originalPlan.tasks
    .slice(0, input.failedTaskIndex)
    .map((t) => t.label);

  return [
    `原始用户请求：${input.message}`,
    `原计划：${input.originalPlan.reasoning}`,
    `失败类型：${failureLabel}`,
    `失败子任务「${failedLabel}」失败原因：${failureReason}`,
    buildReplanExecutionSnapshot(input),
    input.strategyNote ? `策略约束：${input.strategyNote}` : null,
    completedLabels.length > 0
      ? `已完成的子任务：${completedLabels.join("、")}`
      : "尚无已完成子任务",
    "不要重复创建或覆盖已经观察到成功的对象；如果已有待确认操作，请避免生成与其冲突的重复动作。",
    "请为失败的子任务重新生成 1-3 个替代步骤（可包含前置补全步骤），保留已完成任务的结果，并保持其余未执行任务的依赖关系。",
  ].filter(Boolean).join("\n");
};

const replanIncremental = async (
  input: ReplanInput,
  orchestratorService: OrchestratorService,
): Promise<ReplanResult> => {
  const failureLabel = FAILURE_TYPE_LABELS[input.failureType];
  const replanMessage = buildIncrementalReplanMessage(input);

  const invocation = await orchestratorService(replanMessage, input.promptContext);
  if (invocation.status === "unavailable") return invocation;
  const nextPlan = invocation.plan;

  const failedId = input.failedTask.id;
  const failedIndex = input.originalPlan.tasks.findIndex((t) => t.id === failedId);

  if (failedIndex === -1) {
    return { plan: nextPlan, status: "success" };
  }

  const before = input.originalPlan.tasks.slice(0, failedIndex);
  const after = input.originalPlan.tasks.slice(failedIndex + 1).filter(
    (t) => !nextPlan.tasks.some((nt) => nt.id === t.id),
  );

  // Fixup dependencies: tasks that depended on the failed task now depend on new tasks
  const fixedAfter = after.map((task) => ({
    ...task,
    dependsOn: task.dependsOn.map((depId) =>
      depId === failedId && nextPlan.tasks.length > 0
        ? nextPlan.tasks[nextPlan.tasks.length - 1].id
        : depId,
    ),
  }));

  // New tasks depend on the last completed task
  const lastCompletedId = before.length > 0 ? before[before.length - 1].id : undefined;
  const linkedNewTasks = nextPlan.tasks.map((task) => ({
    ...task,
    dependsOn: task.dependsOn.length === 0 && lastCompletedId
      ? [lastCompletedId]
      : task.dependsOn,
  }));

  return {
    plan: {
      mode: before.length + linkedNewTasks.length + fixedAfter.length > 1 ? "compound" : "single",
      reasoning: `增量重规划：${failureLabel}。${nextPlan.reasoning}`,
      tasks: [...before, ...linkedNewTasks, ...fixedAfter],
    },
    status: "success",
  };
};

const replanGlobal = async (
  input: ReplanInput,
  orchestratorService: OrchestratorService,
): Promise<ReplanResult> => {
  const completedLabels = input.originalPlan.tasks
    .slice(0, input.failedTaskIndex)
    .map((t) => t.label);
  const completedIds = new Set(
    input.originalPlan.tasks.slice(0, input.failedTaskIndex).map((t) => t.id),
  );
  const failureLabel = FAILURE_TYPE_LABELS[input.failureType];
  const failureReason = getSafeReplanFailureReason(input);

  const replanMessage = [
    `原始用户请求：${input.message}`,
    `原计划在执行中遇到问题：${failureReason}`,
    `失败类型：${failureLabel}`,
    `失败发生在「${input.failedTask.label}」`,
    buildReplanExecutionSnapshot(input),
    completedLabels.length > 0
      ? `已完成的子任务（请保留不再生成）：${completedLabels.join("、")}`
      : "尚无已完成子任务",
    "不要重复创建或覆盖已经观察到成功的对象；保留执行观察中的真实数据变化。",
    "请基于当前状态重新规划剩余所有工作，给出新的可执行子任务 DAG。",
  ].join("\n");

  const invocation = await orchestratorService(replanMessage, input.promptContext);
  if (invocation.status === "unavailable") return invocation;
  const nextPlan = invocation.plan;

  const remaining = nextPlan.tasks.filter((t) => !completedIds.has(t.id));

  return {
    plan: {
      mode: remaining.length > 1 ? "compound" : "single",
      reasoning: `全局重规划：${failureLabel}。${nextPlan.reasoning}`,
      tasks: remaining,
    },
    status: "success",
  };
};

export const replanAfterTaskFailure = async (
  input: ReplanInput,
  orchestratorService: OrchestratorService = dispatchOrchestratorResult,
): Promise<ReplanResult> => {
  const strategy = input.strategyOverride ?? decideReplanStrategy(input);
  const scopeId = `replan:${input.failedTask.id}`;
  const accountedService: OrchestratorService =
    orchestratorService === dispatchOrchestratorResult
      ? (message, context, signal) =>
          dispatchOrchestratorResult(message, context, signal, {
            modelCallRecorder: input.modelCallRecorder,
            role: "replan",
            scopeId,
          })
      : async (message, context, signal) => {
          input.modelCallRecorder?.record("replan", scopeId);
          return orchestratorService(message, context, signal);
        };

  switch (strategy) {
    case "local":
      return { plan: replanLocal(input), status: "success" };
    case "incremental":
      return replanIncremental(input, accountedService);
    case "global":
      return replanGlobal(input, accountedService);
  }
};
