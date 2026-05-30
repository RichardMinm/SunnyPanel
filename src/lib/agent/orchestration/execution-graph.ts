import {
  createAgentBus,
  mergeTaskArgsWithBus,
  publishAgentResult,
  publishTaskArtifact,
  runSpecializedAgentForTask,
} from "../agents";
import type { AgentRoleArtifactMap } from "../agents/types";
import { recordAutoApproval } from "../audit";
import { executeAgentIntent } from "../executor";
import { logAgentEvent } from "../logger";
import { autoArchiveMemoryFromExecution } from "../memory";
import { buildConfirmedIntentSet, getConsecutiveAutoCount, incrementAutoCount, shouldAutoApprove } from "../permission-resolver";
import type { AgentPromptContext } from "../prompts";
import { buildProposedActionMessage, dryRunAgentIntent } from "../safety";
import type { AutoApprovalContext } from "../safety";
import { getAgentToolDefinition } from "../tool-registry";
import type { AgentToolDryRunContext } from "../tool-registry";
import { parseAgentIntentResult, type AgentIntent, type PendingAction, type ProposedAgentAction } from "../schemas";
import { detectRuleBasedConflicts } from "./conflict-detector";
import {
  buildTaskObservation,
  decideNextActionFromObservations,
  formatTaskObservations,
} from "./observations";
import { groupTasksIntoParallelLayers } from "./parallel-layers";
import { replanAfterTaskFailure } from "./replan";
import type { ReplanInput } from "./replan";
import type { AgentRole, AgentTaskObservation, ExecutionGraphResult, OrchestratorPlan, TaskNode } from "./types";

const MAX_REPLAN_ATTEMPTS = 2;

export {
  buildObservationTraceStep,
  buildTaskObservation,
  decideNextActionFromObservations,
  formatTaskObservation,
  formatTaskObservations,
} from "./observations";

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

export const executeOrchestrationGraph = async (
  plan: OrchestratorPlan,
  dryRunContext: AgentToolDryRunContext,
  options: {
    autoApproval?: AutoApprovalContext;
    message?: string;
    orchestrationId?: string;
    promptContext?: AgentPromptContext;
    replanTaskFailure?: (input: ReplanInput) => Promise<OrchestratorPlan>;
    replanAttempts?: number;
  } = {},
): Promise<ExecutionGraphResult> => {
  const replanAttempts = options.replanAttempts ?? 0;
  const autoApproval = options.autoApproval;
  const { layers, orphanedTaskIds } = groupTasksIntoParallelLayers(plan.tasks);
  const proposals: ProposedAgentAction[] = [];
  const proposalOrder = new Map<string, number>();
  const readOnlyMessages: string[] = [];
  const autoExecutedMessages: string[] = [];
  const observations: AgentTaskObservation[] = [];
  let bus = createAgentBus();
  const message = options.message ?? "";
  const promptContext = options.promptContext;
  const replanTaskFailure = options.replanTaskFailure ?? replanAfterTaskFailure;
  const orchestrationId = options.orchestrationId ?? `orch-${Date.now()}`;
  let clarifyMessage: string | null = null;
  let clarifyPending: PendingAction | null = null;
  let orderIndex = 0;

  const registerProposal = (taskId: string, action: ProposedAgentAction) => {
    proposalOrder.set(taskId, orderIndex);
    orderIndex += 1;
    proposals.push(action);
  };

  const taskErrors: Array<{ error: string; task: TaskNode }> = [];

  const processTask = async (
    task: TaskNode,
  ): Promise<Extract<ExecutionGraphResult, { pendingAction: PendingAction | null }> | null> => {
    try {
      const mergedTask = mergeTaskArgsWithBus(task, bus);
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

        const specialized = await runSpecializedAgentForTask(mergedTask, {
          dryRunContext,
          intent: baseIntent,
          message,
          promptContext,
        });
        intent = specialized.intent;
        bus = publishAgentResult(bus, specialized);
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
            consecutiveAutoCount: getConsecutiveAutoCount(),
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
            const executed = await executeAgentIntent(intent);
            const message = executed.assistantMessage.slice(0, 120);
            autoExecutedMessages.push(`✅ 已自动执行「${task.label}」：${message.slice(0, 80)}`);
            observations.push(buildTaskObservation(task, {
              action: dryRun.action,
              message,
              status: "auto_executed",
            }));
            bus = publishTaskArtifact(bus, {
              from: task.agentRole,
              payload: buildArtifactPayload(task, intent, dryRun.action),
              taskId: task.id,
            });
            void recordAutoApproval({
              action: dryRun.action,
              reason: decision.reason,
              threadId: autoApproval.threadId,
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

      const tool = getAgentToolDefinition(intent.intent);

      if (tool && !tool.requiresConfirmation) {
        const executed = await executeAgentIntent(intent);
        readOnlyMessages.push(executed.assistantMessage);
        observations.push(buildTaskObservation(task, {
          message: executed.assistantMessage,
          status: "executed",
        }));
        bus = publishTaskArtifact(bus, {
          from: task.agentRole,
          payload: buildArtifactPayload(task, intent),
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

  for (const layer of layers) {
    // Serialize tasks that have error conflicts
    const serialTasks = layer.filter((t) => errorConflicts.some((c) => c.tasks.includes(t.id)));
    const parallelTasks = layer.filter((t) => !serialTasks.some((st) => st.id === t.id));

    if (parallelTasks.length > 0) {
      await Promise.all(parallelTasks.map((task) => processTask(task)));
    }

    for (const task of serialTasks) {
      await processTask(task);
    }
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
  const canReplan = Boolean(promptContext && message && replanAttempts < MAX_REPLAN_ATTEMPTS);
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

    const replanned = await replanTaskFailure({
      failedTask: args.failedTask,
      failedTaskIndex: failedIndex >= 0 ? failedIndex : plan.tasks.length - 1,
      failureReason: args.failureReason,
      failureType: args.failureType,
      message,
      originalPlan: plan,
      promptContext,
    });

    if (replanned.tasks.length === 0) {
      return null;
    }

    const replannedResult = await executeOrchestrationGraph(replanned, dryRunContext, {
      ...options,
      replanAttempts: replanAttempts + 1,
    });

    return {
      ...replannedResult,
      assistantMessage: [
        observations.length > 0 ? `重规划前观察：\n${formatTaskObservations(observations)}` : null,
        replannedResult.assistantMessage,
      ].filter(Boolean).join("\n\n"),
      observations: [...observations, ...replannedResult.observations],
    };
  };
  const observationDecision = decideNextActionFromObservations(observations, {
    canReplan,
    hasPendingProposals: sortedProposals.length > 0,
  });

  if (observationDecision.type === "replan") {
    const failedTask = plan.tasks.find((task) => task.id === observationDecision.failedTaskId);

    if (failedTask) {
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
      return {
        assistantMessage: clarifyMessage,
        executedCount: 0,
        observations,
        pendingAction: clarifyPending,
        proposals: [],
      };
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
    return {
      assistantMessage: [
        autoExecutedMessages.length > 0 ? autoExecutedMessages.join("\n") : null,
        plan.reasoning ? `编排说明：${plan.reasoning}` : null,
        readOnlyMessages.length > 0 ? readOnlyMessages.join("\n") : (autoExecutedMessages.length > 0 ? null : "子任务已处理，无需写入确认。"),
      ]
        .filter(Boolean)
        .join("\n\n"),
      executedCount,
      observations,
      pendingAction: null,
      proposals: [],
    };
  }

  maybeAutoArchiveMemory(plan, message, sortedProposals);

  if (clarifyMessage) {
    readOnlyMessages.push(`部分子任务需要补充信息：${clarifyMessage}`);
  }

  const autoExecPrefix = autoExecutedMessages.length > 0 ? `${autoExecutedMessages.join("\n")}\n\n` : "";
  const proposalIntro = readOnlyMessages.length > 0 ? `${autoExecPrefix}${readOnlyMessages.join("\n")}\n\n` : autoExecPrefix;

  const executedCount = readOnlyMessages.length + autoExecutedMessages.length;

  if (sortedProposals.length === 1) {
    const action = sortedProposals[0];

    return {
      assistantMessage: [plan.reasoning, proposalIntro, buildProposedActionMessage(action)].filter(Boolean).join("\n\n"),
      executedCount,
      observations,
      pendingAction: { action, type: "await_confirmation" },
      proposals: sortedProposals,
    };
  }

  const allLowRisk = sortedProposals.every((action) => action.riskLevel === "low" && !action.requiresConfirmation);

  if (allLowRisk) {
    return {
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
      pendingAction: { actions: sortedProposals, orchestrationId, type: "await_batch_confirmation" },
      proposals: sortedProposals,
    };
  }

  const highRisk = sortedProposals.filter((action) => action.riskLevel === "high");
  const batchable = sortedProposals.filter((action) => action.riskLevel !== "high");

  if (highRisk.length > 0 && batchable.length > 0) {
    return {
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
        type: "await_confirmation",
      },
      proposals: sortedProposals,
    };
  }

  return {
    assistantMessage: [
      plan.reasoning,
      proposalIntro,
      `共 ${sortedProposals.length} 项操作待批量确认：`,
      ...sortedProposals.map((action, index) => `${index + 1}. ${action.summary}（${action.riskLevel}）`),
      "回复「确认」执行全部，或「取消」放弃。",
    ].join("\n"),
    executedCount,
    observations,
    pendingAction: { actions: sortedProposals, orchestrationId, type: "await_batch_confirmation" },
    proposals: sortedProposals,
  };
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
