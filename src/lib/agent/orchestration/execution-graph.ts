import {
  createAgentBus,
  formatUpstreamContext,
  mergeTaskArgsWithBus,
  publishTaskArtifact,
  publishTaskIntent,
  runSpecializedAgentForTask,
} from "../agents";
import type { AgentRoleArtifactMap } from "../agents/types";
import { recordAutoApproval as defaultRecordAutoApproval } from "../audit";
import { executeAgentIntent, type AgentIntentExecutor } from "../executor";
import { logAgentEvent } from "../logger";
import { autoArchiveMemoryFromExecution } from "../memory";
import { buildConfirmedIntentSet, getConsecutiveAutoCount, incrementAutoCount, shouldAutoApprove } from "../permission-resolver";
import type { AgentPromptContext } from "../prompts";
import { buildProposedActionMessage, dryRunAgentIntent } from "../safety";
import type { AutoApprovalContext } from "../safety";
import { getAgentToolDefinition } from "../tool-registry";
import type { AgentToolDryRunContext } from "../tool-registry";
import {
  parseAgentIntentResult,
  type AgentIntent,
  type AgentQueueResumePendingAction,
  type AgentStrategyResumePendingAction,
  type PendingAction,
  type ProposedAgentAction,
} from "../schemas";
import { detectRuleBasedConflicts } from "./conflict-detector";
import { buildExecutionEvaluation } from "./evaluation";
import { buildExecutionLoopDirective } from "./loop-directive";
import {
  buildTaskObservation,
  decideNextActionFromObservations,
  formatTaskObservations,
  summarizeExecutionQueue,
} from "./observations";
import { groupTasksIntoParallelLayers } from "./parallel-layers";
import { replanAfterTaskFailure } from "./replan";
import type { ReplanInput, ReplanResult } from "./replan";
import {
  autoArchiveStrategyFeedbackMemory,
  type StrategyFeedbackMemoryInput,
} from "./strategy-feedback";
import { buildToolFailureRepairPlan } from "./tool-failure-repair";
import type {
  AgentExecutionStrategy,
  AgentRole,
  AgentTaskObservation,
  ExecutionGraphResult,
  OrchestratorPlan,
  TaskNode,
} from "./types";
import type { ModelCallBudgetRecorder } from "./model-call-budget";

const MAX_REPLAN_ATTEMPTS = 2;
const MAX_TOOL_REPAIR_ATTEMPTS = 1;

export {
  buildExecutionDecisionTraceStep,
  buildObservationTraceStep,
  buildTaskObservation,
  decideNextActionFromObservations,
  formatTaskObservation,
  formatTaskObservations,
  summarizeExecutionQueue,
} from "./observations";
export { buildExecutionEvaluation } from "./evaluation";
export { buildExecutionLoopDirective } from "./loop-directive";
export { buildStrategyFeedbackMemoryDraft } from "./strategy-feedback";
export { buildToolFailureRepairPlan } from "./tool-failure-repair";

const taskToIntent = (task: TaskNode): AgentIntent | null =>
  parseAgentIntentResult({
    args: task.args,
    confidence: 0.9,
    intent: task.intent,
  });

const buildArtifactPayload = <T extends AgentRole>(
  task: TaskNode & { agentRole: T },
  intent: AgentIntent,
  action?: ProposedAgentAction,
): AgentRoleArtifactMap[T] => {
  const payload: Record<string, unknown> = { ...task.args };

  if (typeof intent.args === "object" && intent.args !== null) {
    Object.assign(payload, intent.args as Record<string, unknown>);
  }

  if (action?.afterSnapshot && typeof action.afterSnapshot === "object" && action.afterSnapshot !== null) {
    const snapshot = action.afterSnapshot as Record<string, unknown>;

    if (typeof snapshot.id === "number") {
      payload.planId = snapshot.id;
      payload.relatedPlanId = snapshot.id;
    }

    if (Array.isArray(snapshot.scheduleItemIds)) {
      payload.scheduleItemIds = snapshot.scheduleItemIds;
    }
  }

  const planId =
    typeof payload.planId === "number"
      ? payload.planId
      : typeof payload.relatedPlanId === "number"
        ? payload.relatedPlanId
        : undefined;

  switch (task.agentRole) {
    case "plan":
      return {
        checklistId: typeof payload.checklistId === "number" ? payload.checklistId : undefined,
        phases: typeof payload.phases === "number" ? payload.phases : undefined,
        planId,
        planTitle: typeof payload.title === "string" ? payload.title : task.label,
        relatedPlanId: planId,
        visibility: payload.visibility === "public" ? "public" : "private",
      } as AgentRoleArtifactMap[T];
    case "schedule":
      return {
        dateRange: Array.isArray(payload.dateRange) ? (payload.dateRange as [string, string]) : undefined,
        planId,
        relatedPlanId: planId,
        scheduleItemIds: Array.isArray(payload.scheduleItemIds)
          ? payload.scheduleItemIds.filter((id): id is number => typeof id === "number")
          : undefined,
      } as AgentRoleArtifactMap[T];
    case "memory":
      return {
        confidence: typeof payload.confidence === "number" ? payload.confidence : undefined,
        memoryId: typeof payload.memoryId === "number" ? payload.memoryId : undefined,
        title: typeof payload.title === "string" ? payload.title : undefined,
        type: typeof payload.type === "string" ? payload.type : undefined,
      } as AgentRoleArtifactMap[T];
    case "content":
      return {
        timelineEventId: typeof payload.timelineEventId === "number" ? payload.timelineEventId : undefined,
      } as AgentRoleArtifactMap[T];
    case "review":
      return {
        planReviewId: typeof payload.planReviewId === "number" ? payload.planReviewId : undefined,
        suggestions: typeof payload.suggestions === "number" ? payload.suggestions : undefined,
      } as AgentRoleArtifactMap[T];
    case "query":
    default:
      return {
        report: typeof payload.report === "string" ? payload.report : task.label,
      } as AgentRoleArtifactMap[T];
  }
};

const maybeAutoArchiveMemory = (
  plan: OrchestratorPlan,
  message: string,
  proposals: ProposedAgentAction[],
) => {
  if (plan.mode !== "compound" || proposals.length <= 1 || !message.trim()) {
    return;
  }

  void autoArchiveMemoryFromExecution({
    message,
    plan,
    proposals,
    userConfirmed: false,
  }).catch((error) => {
    logAgentEvent("warn", "memory.auto_archive_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
  });
};

const resumableObservationStatuses = new Set([
  "answered",
  "auto_executed",
  "clarified",
  "executed",
  "proposed",
  "skipped",
]);

const serializeTasksForPendingAction = (tasks: TaskNode[]) =>
  tasks.map((task) => ({
    agentRole: task.agentRole,
    args: task.args,
    dependsOn: task.dependsOn,
    id: task.id,
    intent: task.intent,
    label: task.label,
  }));

const buildQueueResumePendingAction = ({
  message,
  observations,
  orchestrationId,
  plan,
}: {
  message: string;
  observations: AgentTaskObservation[];
  orchestrationId: string;
  plan: OrchestratorPlan;
}): AgentQueueResumePendingAction | null => {
  const queueState = summarizeExecutionQueue(plan.tasks, observations);

  if (queueState.deferredTaskIds.length === 0) {
    return null;
  }

  const completedTaskIds = Array.from(
    new Set(
      observations
        .filter((observation) => resumableObservationStatuses.has(observation.status))
        .map((observation) => observation.taskId),
    ),
  );

  return {
    completedTaskIds,
    deferredTaskIds: queueState.deferredTaskIds,
    mode: plan.mode,
    orchestrationId,
    originalMessage: message,
    reasoning: plan.reasoning,
    tasks: serializeTasksForPendingAction(plan.tasks),
    type: "await_queue_resume",
  };
};

export const buildResumedOrchestratorPlan = (pending: AgentQueueResumePendingAction): OrchestratorPlan => {
  const deferredIds = new Set(pending.deferredTaskIds);
  const completedIds = new Set(pending.completedTaskIds);
  const tasks: TaskNode[] = pending.tasks
    .filter((task) => deferredIds.has(task.id))
    .map((task) => ({
      agentRole: task.agentRole,
      args: task.args,
      dependsOn: task.dependsOn.filter((dependencyId) => deferredIds.has(dependencyId) && !completedIds.has(dependencyId)),
      id: task.id,
      intent: task.intent,
      label: task.label,
    }));

  return {
    mode: pending.mode,
    reasoning: pending.reasoning ? `继续执行：${pending.reasoning}` : "继续执行已延后的子任务。",
    tasks,
  };
};

const buildStrategyResumePendingAction = ({
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

  if (!originalMessage) {
    return null;
  }

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

export const buildStrategyResumeOrchestratorPlan = (pending: AgentStrategyResumePendingAction): OrchestratorPlan => ({
  mode: pending.mode,
  reasoning: pending.reasoning ? `换策略继续：${pending.reasoning}` : "换策略继续已暂停的编排任务。",
  tasks: pending.tasks.map((task) => ({
    agentRole: task.agentRole,
    args: task.args,
    dependsOn: task.dependsOn,
    id: task.id,
    intent: task.intent,
    label: task.label,
  })),
});

export const executeOrchestrationGraph = async (
  plan: OrchestratorPlan,
  dryRunContext: AgentToolDryRunContext,
  options: {
    autoApproval?: AutoApprovalContext;
    disableToolFailureRepair?: boolean;
    disabledLoopDirectiveModes?: AgentExecutionStrategy["mode"][];
    executeAction?: (
      intent: AgentIntent,
      action: ProposedAgentAction,
    ) => ReturnType<AgentIntentExecutor>;
    executeIntent?: AgentIntentExecutor;
    message?: string;
    modelCallRecorder?: ModelCallBudgetRecorder;
    orchestrationId?: string;
    promptContext?: AgentPromptContext;
    maxTasksPerRun?: number;
    recordAutoApproval?: typeof defaultRecordAutoApproval;
    recordStrategyFeedbackMemory?: (input: StrategyFeedbackMemoryInput) => Promise<unknown>;
    replanTaskFailure?: (input: ReplanInput) => Promise<ReplanResult>;
    replanAttempts?: number;
    toolRepairAttempts?: number;
  } = {},
): Promise<ExecutionGraphResult> => {
  const replanAttempts = options.replanAttempts ?? 0;
  const toolRepairAttempts = options.toolRepairAttempts ?? 0;
  const autoApproval = options.autoApproval;
  const disableToolFailureRepair = options.disableToolFailureRepair ?? false;
  const disabledLoopDirectiveModes = new Set(options.disabledLoopDirectiveModes ?? []);
  const executeIntent = options.executeIntent ?? executeAgentIntent;
  const executeAction =
    options.executeAction ??
    ((intent: AgentIntent) => executeIntent(intent));
  const recordAutoApproval = options.recordAutoApproval ?? defaultRecordAutoApproval;
  const recordStrategyFeedbackMemory = options.recordStrategyFeedbackMemory ?? autoArchiveStrategyFeedbackMemory;
  const { layers, orphanedTaskIds } = groupTasksIntoParallelLayers(plan.tasks);
  const proposals: ProposedAgentAction[] = [];
  const proposalOrder = new Map<string, number>();
  const readOnlyMessages: string[] = [];
  const autoExecutedMessages: string[] = [];
  const observations: AgentTaskObservation[] = [];
  let bus = createAgentBus();
  const message = options.message ?? "";
  const maxTasksPerRun = options.maxTasksPerRun;
  const promptContext = options.promptContext;
  const replanTaskFailure = options.replanTaskFailure ?? replanAfterTaskFailure;
  const orchestrationId = options.orchestrationId ?? `orch-${Date.now()}`;
  let clarifyMessage: string | null = null;
  let clarifyPending: PendingAction | null = null;
  let orderIndex = 0;
  let processedTaskCount = 0;
  let budgetPaused = false;

  const registerProposal = (taskId: string, action: ProposedAgentAction) => {
    proposalOrder.set(taskId, orderIndex);
    orderIndex += 1;
    proposals.push(action);
  };

  const taskErrors: Array<{ error: string; task: TaskNode }> = [];
  const buildQueueState = () => summarizeExecutionQueue(plan.tasks, observations);
  const buildEvaluationForResult = (result: Omit<ExecutionGraphResult, "evaluation">) =>
    buildExecutionEvaluation({
      canReplan,
      context: promptContext,
      observations: result.observations,
      pendingAction: result.pendingAction,
      proposals: result.proposals,
      queueState: result.queueState,
    });
  const finalizeResult = (result: Omit<ExecutionGraphResult, "evaluation">): ExecutionGraphResult => ({
    ...result,
    evaluation: buildEvaluationForResult(result),
  });
  const buildLoopDirectiveResult = async (
    result: Omit<ExecutionGraphResult, "evaluation">,
  ): Promise<ExecutionGraphResult | null> => {
    const evaluation = buildEvaluationForResult(result);
    const directive = buildExecutionLoopDirective(evaluation);

    if (directive.action !== "pause_for_user" || disabledLoopDirectiveModes.has(evaluation.strategy.mode)) {
      return null;
    }

    const strategyPendingAction = buildStrategyResumePendingAction({
      evaluation,
      message,
      orchestrationId,
      plan,
    });

    await recordStrategyFeedbackMemory({
      evaluation,
      observations: result.observations,
      originalMessage: message,
    }).catch((error) => {
      logAgentEvent("warn", "memory.strategy_feedback_failed", {
        error: error instanceof Error ? error.message : String(error),
        strategy: evaluation.strategy.mode,
      });
    });

    return {
      ...result,
      assistantMessage: directive.assistantMessage,
      evaluation,
      pendingAction: strategyPendingAction,
      proposals: [],
    };
  };
  const hasTaskObservation = (taskId: string) => observations.some((observation) => observation.taskId === taskId);
  const budgetLimitReached = () =>
    typeof maxTasksPerRun === "number" && maxTasksPerRun >= 0 && processedTaskCount >= maxTasksPerRun;
  const deferTasks = (tasks: TaskNode[], reason: string) => {
    for (const task of tasks) {
      if (hasTaskObservation(task.id)) {
        continue;
      }

      observations.push(buildTaskObservation(task, {
        message: reason,
        status: "deferred",
      }));
    }
  };
  const hasConfirmationProposal = (fromIndex = 0) =>
    proposals
      .slice(fromIndex)
      .some((action) => action.requiresConfirmation !== false || action.riskLevel !== "low");
  const processTaskWithinBudget = async (task: TaskNode): Promise<boolean> => {
    if (budgetLimitReached()) {
      budgetPaused = true;
      deferTasks([task], `本轮最多处理 ${maxTasksPerRun} 个子任务，已延后。`);

      return false;
    }

    processedTaskCount += 1;
    await processTask(task);

    return true;
  };

  const processTask = async (
    task: TaskNode,
  ): Promise<Extract<ExecutionGraphResult, { pendingAction: PendingAction | null }> | null> => {
    try {
      const mergedTask = mergeTaskArgsWithBus(task, bus, plan.tasks);
      let intent = taskToIntent(mergedTask);

      if (promptContext && message) {
        const baseIntent =
          intent ??
          parseAgentIntentResult({
            args: mergedTask.args,
            confidence: 0.8,
            intent: mergedTask.intent,
          });

        if (!baseIntent) {
          readOnlyMessages.push(`「${task.label}」无法解析，已跳过。`);
          observations.push(buildTaskObservation(task, {
            message: "无法解析为有效意图。",
            status: "skipped",
          }));

          return null;
        }

        // 把上游闭包的产物/推理/意图回灌给下游专业 Agent 的 LLM 上下文，形成反馈闭环。
        const upstreamContext = formatUpstreamContext(mergedTask, bus, plan.tasks);
        const specialized = await runSpecializedAgentForTask(mergedTask, {
          dryRunContext,
          intent: baseIntent,
          message,
          modelCallRecorder: options.modelCallRecorder,
          promptContext,
          upstreamContext: upstreamContext || undefined,
        });
        intent = specialized.intent;
        // 用 intent 消息记录上游 Agent 的最终决策与说明（替代原 bus.results 死数据）。
        bus = publishTaskIntent(bus, {
          from: task.agentRole,
          intent: specialized.intent.intent,
          reasoning: specialized.note,
          taskId: task.id,
        });
      }

      if (!intent) {
        readOnlyMessages.push(`「${task.label}」无法解析，已跳过。`);
        observations.push(buildTaskObservation(task, {
          message: "无法解析为有效意图。",
          status: "skipped",
        }));

        return null;
      }

      if (intent.intent === "answer_question" || intent.intent === "clarify") {
        const message = intent.intent === "answer_question" ? (intent.reply ?? intent.args.answer) : intent.args.question;
        readOnlyMessages.push(message);
        observations.push(buildTaskObservation(task, {
          message,
          status: intent.intent === "answer_question" ? "answered" : "clarified",
        }));

        return null;
      }

      const dryRun = await dryRunAgentIntent(intent, dryRunContext);

      if (dryRun.type === "proposed_action") {
        if (autoApproval) {
          const previouslyConfirmed = buildConfirmedIntentSet(autoApproval.pendingActionHistory, autoApproval.lastIntent);
          const prefs = autoApproval.userPreferences ?? null;
          const decision = shouldAutoApprove(dryRun.action, {
            consecutiveAutoCount: getConsecutiveAutoCount(autoApproval.threadId),
            isFirstActionInThread: autoApproval.isFirstActionInThread,
            previouslyConfirmedIntents: previouslyConfirmed,
            userPreferences: prefs ?? {
              autoApproveIntents: new Set(),
              autoApproveLowRisk: false,
              autonomyLevel: 0,
              deniedIntents: new Set(),
              maxConsecutiveAutoApprovals: 0,
            },
          });

          if (decision.approved) {
            incrementAutoCount(autoApproval.threadId);
            const executed = await executeAction(intent, dryRun.action);
            const message = executed.assistantMessage.slice(0, 120);
            autoExecutedMessages.push(`✅ 已自动执行「${task.label}」：${message.slice(0, 80)}`);
            observations.push(buildTaskObservation(task, {
              action: dryRun.action,
              message,
              rollbackPayload: executed.rollbackPayload,
              status: "auto_executed",
            }));
            bus = publishTaskArtifact(bus, {
              from: task.agentRole,
              payload: buildArtifactPayload(task, intent, dryRun.action),
              reasoning: `已自动执行：${message}`,
              taskId: task.id,
            });
            void recordAutoApproval({
              action: dryRun.action,
              reason: decision.reason,
              threadId: autoApproval.threadId,
            }).catch((error) => {
              logAgentEvent("error", "permission.auto_approval_audit_failed", {
                error: error instanceof Error ? error.message : String(error),
                threadId: autoApproval.threadId,
              });
            });

            return null;
          }
        }

        registerProposal(task.id, dryRun.action);
        observations.push(buildTaskObservation(task, {
          action: dryRun.action,
          message: dryRun.action.summary,
          status: "proposed",
        }));
        bus = publishTaskArtifact(bus, {
          from: task.agentRole,
          payload: buildArtifactPayload(task, intent, dryRun.action),
          reasoning: `待确认提案：${dryRun.action.summary}`,
          taskId: task.id,
        });

        return null;
      }

      if (dryRun.type === "clarify") {
        if (!clarifyMessage) {
          clarifyMessage = dryRun.assistantMessage;
          clarifyPending = dryRun.pendingAction;
        }
        observations.push(buildTaskObservation(task, {
          message: dryRun.assistantMessage,
          status: "clarified",
        }));

        return null;
      }

      if (dryRun.type === "bypass" && dryRun.action) {
        const isWrite =
          (dryRun.action.affectedDocuments?.length ?? 0) > 0;
        const executed = isWrite
          ? await executeAction(intent, dryRun.action)
          : await executeIntent(intent);
        const message = executed.assistantMessage.slice(0, 120);

        if (isWrite) {
          autoExecutedMessages.push(
            `✅ 已执行「${task.label}」：${message.slice(0, 80)}`,
          );
        } else {
          readOnlyMessages.push(executed.assistantMessage);
        }

        observations.push(
          buildTaskObservation(task, {
            action: dryRun.action,
            message,
            rollbackPayload: executed.rollbackPayload,
            status: isWrite ? "auto_executed" : "executed",
          }),
        );
        bus = publishTaskArtifact(bus, {
          from: task.agentRole,
          payload: buildArtifactPayload(
            task,
            intent,
            dryRun.action,
          ),
          reasoning: message,
          taskId: task.id,
        });

        return null;
      }

      const tool = getAgentToolDefinition(intent.intent);

      if (tool && !tool.requiresConfirmation) {
        const executed = await executeIntent(intent);
        readOnlyMessages.push(executed.assistantMessage);
        observations.push(buildTaskObservation(task, {
          message: executed.assistantMessage,
          rollbackPayload: executed.rollbackPayload,
          status: "executed",
        }));
        bus = publishTaskArtifact(bus, {
          from: task.agentRole,
          payload: buildArtifactPayload(task, intent),
          reasoning: executed.assistantMessage.slice(0, 160),
          taskId: task.id,
        });
      }

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      taskErrors.push({ error: errorMessage, task });
      readOnlyMessages.push(`❌「${task.label}」执行失败：${errorMessage.slice(0, 120)}`);
      observations.push(buildTaskObservation(task, {
        error: errorMessage,
        message: "执行失败，等待重规划或用户处理。",
        status: "failed",
      }));

      logAgentEvent("error", "orchestrator.task_error", {
        error: errorMessage,
        taskId: task.id,
        taskLabel: task.label,
      });

      return null;
    }
  };

  const conflicts = detectRuleBasedConflicts(plan.tasks, layers);
  const errorConflicts = conflicts.filter((c) => c.severity === "error");
  const warningConflicts = conflicts.filter((c) => c.severity === "warning");

  if (warningConflicts.length > 0) {
    for (const conflict of warningConflicts) {
      readOnlyMessages.push(`⚠️ ${conflict.description}`);
    }
  }

  for (const [layerIndex, layer] of layers.entries()) {
    const proposalCountBeforeLayer = proposals.length;

    // Serialize tasks that have error conflicts
    const serialTasks = layer.filter((t) => errorConflicts.some((c) => c.tasks.includes(t.id)));
    const parallelTasks = layer.filter((t) => !serialTasks.some((st) => st.id === t.id));

    if (budgetLimitReached()) {
      budgetPaused = true;
      deferTasks(layers.slice(layers.indexOf(layer)).flat(), `本轮最多处理 ${maxTasksPerRun} 个子任务，已延后。`);
      break;
    }

    if (parallelTasks.length > 0) {
      await Promise.all(parallelTasks.map((task) => processTaskWithinBudget(task)));
    }

    if (budgetPaused) {
      deferTasks(serialTasks, `本轮最多处理 ${maxTasksPerRun} 个子任务，已延后。`);
      const currentLayerIndex = layers.indexOf(layer);
      deferTasks(layers.slice(currentLayerIndex + 1).flat(), `本轮最多处理 ${maxTasksPerRun} 个子任务，已延后。`);
      break;
    }

    for (let index = 0; index < serialTasks.length; index += 1) {
      const processed = await processTaskWithinBudget(serialTasks[index]);

      if (!processed) {
        deferTasks(serialTasks.slice(index + 1), `本轮最多处理 ${maxTasksPerRun} 个子任务，已延后。`);
        const currentLayerIndex = layers.indexOf(layer);
        deferTasks(layers.slice(currentLayerIndex + 1).flat(), `本轮最多处理 ${maxTasksPerRun} 个子任务，已延后。`);
        break;
      }
    }

    if (budgetPaused) {
      break;
    }

    if (hasConfirmationProposal(proposalCountBeforeLayer)) {
      const remainingLayers = layers.slice(layerIndex + 1).flat();
      deferTasks(remainingLayers, "前置写操作正在等待用户确认，后续任务已延后。");
      break;
    }
  }

  if (budgetPaused) {
    readOnlyMessages.push(
      `⏸ 已达到本轮执行预算（${processedTaskCount}/${plan.tasks.length} 个子任务），剩余任务已延后。回复「继续」可从延后队列恢复执行。`,
    );
  }

  if (orphanedTaskIds.length > 0) {
    readOnlyMessages.push(
      `有 ${orphanedTaskIds.length} 个子任务因依赖关系无法解析（${orphanedTaskIds.join("、")}），请检查编排依赖。`,
    );
    for (const taskId of orphanedTaskIds) {
      const task = plan.tasks.find((item) => item.id === taskId);
      if (task) {
        observations.push(buildTaskObservation(task, {
          error: "依赖关系无法解析。",
          message: "依赖关系无法解析，未进入执行层。",
          status: "blocked",
        }));
      }
    }
  }

  const sortedProposals = [...proposals].sort(
    (left, right) =>
      (proposalOrder.get(left.id) ?? 0) - (proposalOrder.get(right.id) ?? 0),
  );
  const resumeQueue = buildQueueResumePendingAction({
    message,
    observations,
    orchestrationId,
    plan,
  });
  const resumeQueueNote = resumeQueue
    ? `还有 ${resumeQueue.deferredTaskIds.length} 个子任务已延后；处理当前步骤后可回复「继续」恢复执行。`
    : null;
  const canReplan = Boolean(promptContext && message && replanAttempts < MAX_REPLAN_ATTEMPTS);
  const pauseForLoopDirective = () =>
    buildLoopDirectiveResult({
      assistantMessage: readOnlyMessages.join("\n"),
      executedCount: readOnlyMessages.length + autoExecutedMessages.length,
      observations,
      pendingAction: null,
      proposals: sortedProposals,
      queueState: buildQueueState(),
    });
  const replanFromTask = async (args: {
    failedTask: TaskNode;
    failureReason: string;
    failureType: ReplanInput["failureType"];
  }): Promise<ExecutionGraphResult | null> => {
    if (!promptContext || !message || replanAttempts >= MAX_REPLAN_ATTEMPTS) {
      return null;
    }

    const failedIndex = plan.tasks.findIndex((task) => task.id === args.failedTask.id);

    logAgentEvent("info", "orchestrator.replan", {
      attempt: replanAttempts + 1,
      failedTaskId: args.failedTask.id,
      reason: args.failureReason,
      strategy: args.failureType,
    });

    const replanResult = await replanTaskFailure({
      failedTask: args.failedTask,
      failedTaskIndex: failedIndex >= 0 ? failedIndex : plan.tasks.length - 1,
      failureReason: args.failureReason,
      failureType: args.failureType,
      message,
      observations: [...observations],
      originalPlan: plan,
      proposals: sortedProposals,
      promptContext,
      queueState: buildQueueState(),
    });

    if (replanResult.status === "unavailable") {
      logAgentEvent("warn", "orchestrator.replan_unavailable", {
        reason: replanResult.reason,
      });
      return finalizeResult({
        assistantMessage: replanResult.safeMessage,
        executedCount: readOnlyMessages.length + autoExecutedMessages.length,
        observations,
        pendingAction: null,
        proposals: [],
        queueState: buildQueueState(),
      });
    }

    const replanned = replanResult.plan;

    if (replanned.tasks.length === 0) {
      return null;
    }

    const replannedResult = await executeOrchestrationGraph(replanned, dryRunContext, {
      ...options,
      replanAttempts: replanAttempts + 1,
    });

    const { evaluation: _evaluation, ...replannedBase } = replannedResult;

    return finalizeResult({
      ...replannedBase,
      assistantMessage: [
        observations.length > 0 ? `重规划前观察：\n${formatTaskObservations(observations)}` : null,
        replannedResult.assistantMessage,
      ].filter(Boolean).join("\n\n"),
      observations: [...observations, ...replannedResult.observations],
      queueState: summarizeExecutionQueue(
        [...plan.tasks, ...replanned.tasks.filter((task) => !plan.tasks.some((existing) => existing.id === task.id))],
        [...observations, ...replannedResult.observations],
      ),
    });
  };
  const repairFromToolFailure = async (args: {
    failedTask: TaskNode;
    failureReason: string;
  }): Promise<ExecutionGraphResult | null> => {
    if (disableToolFailureRepair || toolRepairAttempts >= MAX_TOOL_REPAIR_ATTEMPTS) {
      return null;
    }

    const repair = buildToolFailureRepairPlan({
      failedTask: args.failedTask,
      failureReason: args.failureReason,
      message,
    });

    if (!repair) {
      return null;
    }

    logAgentEvent("info", "orchestrator.semantic_repair", {
      failedTaskId: args.failedTask.id,
      kind: repair.failureKind,
      reason: args.failureReason,
      repairTaskIds: repair.plan.tasks.map((task) => task.id),
    });

    const repairedResult = await executeOrchestrationGraph(repair.plan, dryRunContext, {
      ...options,
      toolRepairAttempts: toolRepairAttempts + 1,
    });
    const { evaluation: _evaluation, ...repairedBase } = repairedResult;
    const repairTaskId = repair.plan.tasks.find((task) => task.intent !== "answer_question")?.id ?? repair.plan.tasks[0]?.id;
    const repairedOriginalObservations = observations.map((observation) =>
      observation.taskId === args.failedTask.id && observation.status === "failed" && repairTaskId
        ? {
          ...observation,
          message: `${observation.message} 已转入语义修复：${repair.summary}`,
          repairedByTaskId: repairTaskId,
        }
        : observation,
    );
    const allObservations = [...repairedOriginalObservations, ...repairedResult.observations];

    return finalizeResult({
      ...repairedBase,
      assistantMessage: [
        repairedOriginalObservations.length > 0 ? `语义修复前观察：\n${formatTaskObservations(repairedOriginalObservations)}` : null,
        `语义修复：${repair.summary}`,
        repairedResult.assistantMessage,
      ].filter(Boolean).join("\n\n"),
      observations: allObservations,
      queueState: summarizeExecutionQueue(
        [...plan.tasks, ...repair.plan.tasks.filter((task) => !plan.tasks.some((existing) => existing.id === task.id))],
        allObservations,
      ),
    });
  };
  const observationDecision = decideNextActionFromObservations(observations, {
    canReplan,
    hasPendingProposals: sortedProposals.length > 0,
  });

  if (observationDecision.type === "replan") {
    const failedTask = plan.tasks.find((task) => task.id === observationDecision.failedTaskId);

    if (failedTask) {
      const directiveResult = await pauseForLoopDirective();

      if (directiveResult) {
        return directiveResult;
      }

      const repairedResult = await repairFromToolFailure({
        failedTask,
        failureReason: observationDecision.reason.slice(0, 200),
      });

      if (repairedResult) {
        return repairedResult;
      }

      const replannedResult = await replanFromTask({
        failedTask,
        failureReason: observationDecision.reason.slice(0, 200),
        failureType: "tool_error",
      });

      if (replannedResult) {
        return replannedResult;
      }
    }
  }

  if (sortedProposals.length === 0) {
    if (clarifyMessage) {
      return finalizeResult({
        assistantMessage: clarifyMessage,
        executedCount: 0,
        observations,
        pendingAction: clarifyPending,
        proposals: [],
        queueState: buildQueueState(),
      });
    }

    if (
      promptContext &&
      message &&
      replanAttempts < MAX_REPLAN_ATTEMPTS &&
      (orphanedTaskIds.length > 0 || readOnlyMessages.some((line) => line.includes("无法解析") || line.includes("执行失败")))
    ) {
      const firstError = taskErrors[0];
      const failedTask = firstError
        ? firstError.task
        : (plan.tasks.find((task) => orphanedTaskIds.includes(task.id)) ?? plan.tasks[plan.tasks.length - 1]);

      if (failedTask) {
        const failureReason = firstError
          ? firstError.error.slice(0, 200)
          : orphanedTaskIds.length > 0
            ? `依赖未解析：${orphanedTaskIds.join("、")}`
            : "部分子任务无法解析或跳过";
        const failureType = firstError ? "tool_error" as const : orphanedTaskIds.length > 0 ? "dependency_failure" as const : "parse_error" as const;
        const directiveResult = await pauseForLoopDirective();

        if (directiveResult) {
          return directiveResult;
        }

        const repairedResult = firstError
          ? await repairFromToolFailure({
            failedTask,
            failureReason,
          })
          : null;

        if (repairedResult) {
          return repairedResult;
        }

        const replannedResult = await replanFromTask({
          failedTask,
          failureReason,
          failureType,
        });

        if (replannedResult) {
          return replannedResult;
        }
      }
    }

    const executedCount = readOnlyMessages.length + autoExecutedMessages.length;
    return finalizeResult({
      assistantMessage: [
        autoExecutedMessages.length > 0 ? autoExecutedMessages.join("\n") : null,
        plan.reasoning ? `编排说明：${plan.reasoning}` : null,
        readOnlyMessages.length > 0 ? readOnlyMessages.join("\n") : (autoExecutedMessages.length > 0 ? null : "子任务已处理，无需写入确认。"),
        resumeQueue ? `回复「继续」恢复 ${resumeQueue.deferredTaskIds.length} 个延后子任务，或回复「取消」放弃这条待执行队列。` : null,
      ]
        .filter(Boolean)
        .join("\n\n"),
      executedCount,
      observations,
      pendingAction: resumeQueue,
      proposals: [],
      queueState: buildQueueState(),
    });
  }

  maybeAutoArchiveMemory(plan, message, sortedProposals);

  if (clarifyMessage) {
    readOnlyMessages.push(`部分子任务需要补充信息：${clarifyMessage}`);
  }

  const autoExecPrefix = autoExecutedMessages.length > 0 ? `${autoExecutedMessages.join("\n")}\n\n` : "";
  const proposalDetails = [readOnlyMessages.length > 0 ? readOnlyMessages.join("\n") : null, resumeQueueNote].filter(Boolean).join("\n");
  const proposalIntro = proposalDetails.length > 0 ? `${autoExecPrefix}${proposalDetails}\n\n` : autoExecPrefix;

  const executedCount = readOnlyMessages.length + autoExecutedMessages.length;

  if (sortedProposals.length === 1) {
    const action = sortedProposals[0];

    return finalizeResult({
      assistantMessage: [plan.reasoning, proposalIntro, buildProposedActionMessage(action)].filter(Boolean).join("\n\n"),
      executedCount,
      observations,
      pendingAction: { action, resumeQueue: resumeQueue ?? undefined, type: "await_confirmation" },
      proposals: sortedProposals,
      queueState: buildQueueState(),
    });
  }

  const allLowRisk = sortedProposals.every((action) => action.riskLevel === "low" && !action.requiresConfirmation);

  if (allLowRisk) {
    return finalizeResult({
      assistantMessage: [
        plan.reasoning,
        proposalIntro,
        `共 ${sortedProposals.length} 项低风险操作待批量确认：`,
        ...sortedProposals.map((action, index) => `${index + 1}. ${action.summary}`),
      ]
        .filter(Boolean)
        .join("\n"),
      executedCount,
      observations,
      pendingAction: { actions: sortedProposals, orchestrationId, resumeQueue: resumeQueue ?? undefined, type: "await_batch_confirmation" },
      proposals: sortedProposals,
      queueState: buildQueueState(),
    });
  }

  const highRisk = sortedProposals.filter((action) => action.riskLevel === "high");
  const batchable = sortedProposals.filter((action) => action.riskLevel !== "high");

  if (highRisk.length > 0 && batchable.length > 0) {
    return finalizeResult({
      assistantMessage: [
        plan.reasoning,
        proposalIntro,
        `检测到 ${highRisk.length} 项高风险操作需单独确认，另有 ${batchable.length} 项可在下一步批量确认。请先处理：${highRisk[0].summary}`,
      ].join("\n"),
      executedCount,
      observations,
      pendingAction: {
        action: highRisk[0],
        deferredActions: batchable,
        orchestrationId,
        resumeQueue: resumeQueue ?? undefined,
        type: "await_confirmation",
      },
      proposals: sortedProposals,
      queueState: buildQueueState(),
    });
  }

  return finalizeResult({
    assistantMessage: [
      plan.reasoning,
      proposalIntro,
      `共 ${sortedProposals.length} 项操作待批量确认：`,
      ...sortedProposals.map((action, index) => `${index + 1}. ${action.summary}（${action.riskLevel}）`),
      "回复「确认」执行全部，或「取消」放弃。",
    ].join("\n"),
    executedCount,
    observations,
    pendingAction: { actions: sortedProposals, orchestrationId, resumeQueue: resumeQueue ?? undefined, type: "await_batch_confirmation" },
    proposals: sortedProposals,
    queueState: buildQueueState(),
  });
};

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
