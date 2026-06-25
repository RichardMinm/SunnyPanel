import {
  formatUpstreamContext,
  mergeTaskArgsWithBus,
  runSpecializedAgentForTask,
  type AgentBusMessage,
} from "@/lib/agent/agents";
import type { AgentRoleArtifactMap } from "@/lib/agent/agents/types";
import { recordAutoApproval as defaultRecordAutoApproval } from "@/lib/agent/audit";
import {
  executeAgentIntent,
  type AgentIntentExecutor,
} from "@/lib/agent/executor";
import {
  buildConfirmedIntentSet,
  getConsecutiveAutoCount,
  incrementAutoCount,
  shouldAutoApprove,
} from "@/lib/agent/permission-resolver";
import type { AgentPromptContext } from "@/lib/agent/prompts";
import {
  createIntentFromProposedAction,
  dryRunAgentIntent,
} from "@/lib/agent/safety";
import type { AutoApprovalContext } from "@/lib/agent/safety";
import {
  parseAgentIntentResult,
  type AgentDryRunResult,
  type AgentIntent,
  type ProposedAgentAction,
} from "@/lib/agent/schemas";
import { getAgentToolDefinition } from "@/lib/agent/tool-registry";
import type { AgentToolDryRunContext } from "@/lib/agent/tool-registry";
import type {
  NativeOrchestrationSubgraphDependencies,
  PreparedOrchestrationTask,
} from "@/lib/agent/langgraph/orchestration-subgraph";
import { buildTaskObservation } from "@/lib/agent/orchestration/observations";
import type {
  AgentRole,
  OrchestratorPlan,
  TaskNode,
} from "@/lib/agent/orchestration/types";

type NativePreparedPayload =
  | {
      busMessages: AgentBusMessage[];
      intent: AgentIntent;
      message: string;
      type: "answer";
    }
  | {
      busMessages: AgentBusMessage[];
      dryRun: Extract<AgentDryRunResult, { type: "clarify" }>;
      intent: AgentIntent;
      type: "clarify";
    }
  | {
      busMessages: AgentBusMessage[];
      error: string;
      type: "failed";
    }
  | {
      action: ProposedAgentAction;
      autoApprovalReason?: string;
      busMessages: AgentBusMessage[];
      intent: AgentIntent;
      isWrite: boolean;
      type: "execute";
    }
  | {
      action: ProposedAgentAction;
      busMessages: AgentBusMessage[];
      intent: AgentIntent;
      type: "proposal";
    }
  | {
      busMessages: AgentBusMessage[];
      message: string;
      type: "skipped";
    };

type NativePreparedTask = PreparedOrchestrationTask & {
  payload: NativePreparedPayload;
};

export type NativeOrchestrationTaskExecutorOptions = {
  autoApproval?: AutoApprovalContext;
  dryRunContext: AgentToolDryRunContext;
  executeAction?: (
    intent: AgentIntent,
    action: ProposedAgentAction,
  ) => ReturnType<AgentIntentExecutor>;
  executeIntent?: AgentIntentExecutor;
  message?: string;
  plan?: OrchestratorPlan;
  promptContext?: AgentPromptContext;
  recordAutoApproval?: typeof defaultRecordAutoApproval;
};

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

  if (
    action?.afterSnapshot &&
    typeof action.afterSnapshot === "object" &&
    action.afterSnapshot !== null
  ) {
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
        checklistId:
          typeof payload.checklistId === "number"
            ? payload.checklistId
            : undefined,
        phases:
          typeof payload.phases === "number"
            ? payload.phases
            : undefined,
        planId,
        planTitle:
          typeof payload.title === "string"
            ? payload.title
            : task.label,
        relatedPlanId: planId,
        visibility:
          payload.visibility === "public" ? "public" : "private",
      } as AgentRoleArtifactMap[T];
    case "schedule":
      return {
        dateRange: Array.isArray(payload.dateRange)
          ? (payload.dateRange as [string, string])
          : undefined,
        planId,
        relatedPlanId: planId,
        scheduleItemIds: Array.isArray(payload.scheduleItemIds)
          ? payload.scheduleItemIds.filter(
              (id): id is number => typeof id === "number",
            )
          : undefined,
      } as AgentRoleArtifactMap[T];
    case "memory":
      return {
        confidence:
          typeof payload.confidence === "number"
            ? payload.confidence
            : undefined,
        memoryId:
          typeof payload.memoryId === "number"
            ? payload.memoryId
            : undefined,
        title:
          typeof payload.title === "string"
            ? payload.title
            : undefined,
        type:
          typeof payload.type === "string"
            ? payload.type
            : undefined,
      } as AgentRoleArtifactMap[T];
    case "content":
      return {
        timelineEventId:
          typeof payload.timelineEventId === "number"
            ? payload.timelineEventId
            : undefined,
      } as AgentRoleArtifactMap[T];
    case "review":
      return {
        planReviewId:
          typeof payload.planReviewId === "number"
            ? payload.planReviewId
            : undefined,
        suggestions:
          typeof payload.suggestions === "number"
            ? payload.suggestions
            : undefined,
      } as AgentRoleArtifactMap[T];
    case "query":
    default:
      return {
        report:
          typeof payload.report === "string"
            ? payload.report
            : task.label,
      } as AgentRoleArtifactMap[T];
  }
};

const intentBusMessage = (
  task: TaskNode,
  intent: AgentIntent,
  reasoning: string,
): AgentBusMessage => ({
  from: task.agentRole,
  payload: { intent: intent.intent },
  reasoning,
  taskId: task.id,
  type: "intent",
});

const artifactBusMessage = (
  task: TaskNode,
  intent: AgentIntent,
  reasoning: string,
  action?: ProposedAgentAction,
): AgentBusMessage => ({
  from: task.agentRole,
  payload: buildArtifactPayload(task, intent, action),
  reasoning,
  taskId: task.id,
  type: "artifact",
});

const resolveAutoApproval = (
  action: ProposedAgentAction,
  context: AutoApprovalContext | undefined,
) => {
  if (!context) {
    return { approved: false, reason: "未启用自动批准" };
  }

  return shouldAutoApprove(action, {
    consecutiveAutoCount: getConsecutiveAutoCount(context.threadId),
    isFirstActionInThread: context.isFirstActionInThread,
    previouslyConfirmedIntents: buildConfirmedIntentSet(
      context.pendingActionHistory,
      context.lastIntent,
    ),
    userPreferences: context.userPreferences ?? {
      autoApproveIntents: new Set(),
      autoApproveLowRisk: false,
      autonomyLevel: 0,
      deniedIntents: new Set(),
      maxConsecutiveAutoApprovals: 0,
    },
  });
};

const toPreparedTask = (
  task: TaskNode,
  kind: PreparedOrchestrationTask["kind"],
  payload: NativePreparedPayload,
): NativePreparedTask => ({ kind, payload, task });

export const createNativeOrchestrationTaskExecutor = (
  options: NativeOrchestrationTaskExecutorOptions,
): NativeOrchestrationSubgraphDependencies => {
  const executeIntent = options.executeIntent ?? executeAgentIntent;
  const executeAction =
    options.executeAction ??
    ((intent: AgentIntent) => executeIntent(intent));
  const recordAutoApproval =
    options.recordAutoApproval ?? defaultRecordAutoApproval;

  return {
    prepareTask: async ({ bus, plan, task }) => {
      const busMessages: AgentBusMessage[] = [];

      try {
        const mergedTask = mergeTaskArgsWithBus(
          task,
          bus,
          plan.tasks,
        );
        let intent = taskToIntent(mergedTask);

        if (options.promptContext && options.message) {
          const baseIntent =
            intent ??
            parseAgentIntentResult({
              args: mergedTask.args,
              confidence: 0.8,
              intent: mergedTask.intent,
            });

          if (!baseIntent) {
            return toPreparedTask(task, "read", {
              busMessages,
              message: "无法解析为有效意图。",
              type: "skipped",
            });
          }

          const specialized = await runSpecializedAgentForTask(
            mergedTask,
            {
              dryRunContext: options.dryRunContext,
              intent: baseIntent,
              message: options.message,
              promptContext: options.promptContext,
              upstreamContext:
                formatUpstreamContext(
                  mergedTask,
                  bus,
                  plan.tasks,
                ) || undefined,
            },
          );
          intent = specialized.intent;
          busMessages.push(
            intentBusMessage(
              task,
              intent,
              specialized.note,
            ),
          );
        }

        if (!intent) {
          return toPreparedTask(task, "read", {
            busMessages,
            message: "无法解析为有效意图。",
            type: "skipped",
          });
        }

        if (
          intent.intent === "answer_question" ||
          intent.intent === "clarify"
        ) {
          const answer =
            intent.intent === "answer_question"
              ? (intent.reply ?? intent.args.answer)
              : intent.args.question;

          return toPreparedTask(task, "read", {
            busMessages,
            intent,
            message: answer,
            type: "answer",
          });
        }

        const dryRun = await dryRunAgentIntent(
          intent,
          options.dryRunContext,
        );

        if (dryRun.type === "clarify") {
          return toPreparedTask(task, "proposal", {
            busMessages,
            dryRun,
            intent,
            type: "clarify",
          });
        }

        if (dryRun.type === "proposed_action") {
          const decision = resolveAutoApproval(
            dryRun.action,
            options.autoApproval,
          );

          if (decision.approved) {
            return toPreparedTask(task, "write", {
              action: dryRun.action,
              autoApprovalReason: decision.reason,
              busMessages,
              intent,
              isWrite: true,
              type: "execute",
            });
          }

          return toPreparedTask(task, "proposal", {
            action: dryRun.action,
            busMessages,
            intent,
            type: "proposal",
          });
        }

        if (dryRun.action) {
          const isWrite =
            (dryRun.action.affectedDocuments?.length ?? 0) > 0;

          return toPreparedTask(task, isWrite ? "write" : "read", {
            action: dryRun.action,
            busMessages,
            intent,
            isWrite,
            type: "execute",
          });
        }

        const tool = getAgentToolDefinition(intent.intent);

        if (!tool || tool.requiresConfirmation) {
          return toPreparedTask(task, "read", {
            busMessages,
            message: "该任务没有可直接执行的工具。",
            type: "skipped",
          });
        }

        return toPreparedTask(task, "read", {
          action: {
            args: intent.args,
            changes: [],
            id: `read:${task.id}`,
            intent: intent.intent,
            requiresConfirmation: false,
            riskLevel: "low",
            summary: task.label,
          },
          busMessages,
          intent,
          isWrite: false,
          type: "execute",
        });
      } catch (error) {
        return toPreparedTask(task, "read", {
          busMessages,
          error:
            error instanceof Error
              ? error.message
              : String(error),
          type: "failed",
        });
      }
    },
    executePreparedTask: async ({ prepared }) => {
      const native = prepared as NativePreparedTask;
      const payload = native.payload;
      const task = native.task;
      const base = {
        busMessages: payload.busMessages,
        taskId: task.id,
      };

      if (payload.type === "failed") {
        return {
          ...base,
          assistantMessage: `❌「${task.label}」执行失败：${payload.error}`,
          observation: buildTaskObservation(task, {
            error: payload.error,
            message: "执行失败，等待重规划或用户处理。",
            status: "failed",
          }),
        };
      }

      if (payload.type === "skipped") {
        return {
          ...base,
          assistantMessage: `「${task.label}」无法解析，已跳过。`,
          observation: buildTaskObservation(task, {
            message: payload.message,
            status: "skipped",
          }),
        };
      }

      if (payload.type === "answer") {
        return {
          ...base,
          assistantMessage: payload.message,
          observation: buildTaskObservation(task, {
            message: payload.message,
            status:
              payload.intent.intent === "answer_question"
                ? "answered"
                : "clarified",
          }),
        };
      }

      if (payload.type === "clarify") {
        return {
          ...base,
          assistantMessage: payload.dryRun.assistantMessage,
          observation: buildTaskObservation(task, {
            message: payload.dryRun.assistantMessage,
            status: "clarified",
          }),
          pendingAction: payload.dryRun.pendingAction,
          stopBeforeWrites: true,
        };
      }

      if (payload.type === "proposal") {
        return {
          ...base,
          assistantMessage: payload.action.summary,
          busMessages: [
            ...payload.busMessages,
            artifactBusMessage(
              task,
              payload.intent,
              `待确认提案：${payload.action.summary}`,
              payload.action,
            ),
          ],
          observation: buildTaskObservation(task, {
            action: payload.action,
            message: payload.action.summary,
            status: "proposed",
          }),
          proposal: payload.action,
        };
      }

      try {
        const executed = payload.isWrite
          ? await executeAction(payload.intent, payload.action)
          : await executeIntent(payload.intent);
        const message = executed.assistantMessage;

        if (
          payload.autoApprovalReason &&
          options.autoApproval
        ) {
          incrementAutoCount(options.autoApproval.threadId);
          void recordAutoApproval({
            action: payload.action,
            reason: payload.autoApprovalReason,
            threadId: options.autoApproval.threadId,
          }).catch(() => undefined);
        }

        return {
          ...base,
          assistantMessage: message,
          busMessages: [
            ...payload.busMessages,
            artifactBusMessage(
              task,
              payload.intent,
              message.slice(0, 160),
              payload.action,
            ),
          ],
          observation: buildTaskObservation(task, {
            action: payload.action,
            message: message.slice(0, 120),
            rollbackPayload: executed.rollbackPayload,
            status: payload.isWrite
              ? "auto_executed"
              : "executed",
          }),
          rollbackPayload: executed.rollbackPayload,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        return {
          ...base,
          assistantMessage: `❌「${task.label}」执行失败：${errorMessage}`,
          observation: buildTaskObservation(task, {
            error: errorMessage,
            message: "执行失败，等待重规划或用户处理。",
            status: "failed",
          }),
        };
      }
    },
    executeConfirmedAction: async ({ action, task }) => {
      const intent = createIntentFromProposedAction(action);

      if (!intent) {
        throw new Error(
          `无法恢复确认动作 ${action.id} 的执行参数。`,
        );
      }

      const executed = await executeAction(intent, action);
      const message = executed.assistantMessage;

      return {
        assistantMessage: message,
        busMessages: [
          artifactBusMessage(
            task,
            intent,
            message.slice(0, 160),
            action,
          ),
        ],
        observation: buildTaskObservation(task, {
          action,
          message: message.slice(0, 120),
          rollbackPayload: executed.rollbackPayload,
          status: "executed",
        }),
        rollbackPayload: executed.rollbackPayload,
        taskId: task.id,
      };
    },
  };
};
