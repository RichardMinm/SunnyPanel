import type { Payload } from "payload";

import { evaluatePolicyGuard } from "@/lib/agent/policy/tool-gate";
import { applyPolicyGuard } from "@/lib/agent/policy/guard";
import { attachCapabilityToProposedAction } from "@/lib/agent/capabilities/adapters";
import { normalizeRouterOutput } from "@/lib/agent/router/normalize-router-output";
import type { AgentTurnTrace } from "@/lib/agent/trace/agent-turn-trace";
import { recordDryRunTrace, recordPolicyGuardOutputTrace, recordPolicyTrace, recordResolverTrace, recordToolPlanTrace } from "@/lib/agent/trace/agent-turn-trace";
import { resolveDeleteTarget, resolveModifyTarget } from "@/lib/agent/resolver/target-resolver";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import type { IntentResolution } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import { getAgentModelConfig, type StreamTokenCallback } from "@/lib/agent/client";
import { recordAutoApproval } from "@/lib/agent/audit";
import { logAgentEvent } from "@/lib/agent/logger";
import { buildConfirmedIntentSet, getConsecutiveAutoCount, incrementAutoCount, shouldAutoApprove } from "@/lib/agent/permission-resolver";
import { buildProposedActionMessage, dryRunAgentIntent } from "@/lib/agent/safety";
import type { AutoApprovalContext } from "@/lib/agent/safety";
import type { AgentChatResponse, AgentEngine, AgentIntent, AgentTraceStep, ComposePlanArgs, PendingAction } from "@/lib/agent/schemas";
import { isConversationalIntent } from "@/lib/agent/schemas";
import { normalizeSessionState } from "@/lib/agent/session/normalize-session";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";
import { detectScheduleConflicts, getScheduleForDateRange, getScheduleItemById } from "@/lib/schedule/items";
import { decomposePlanForCompose } from "@/lib/agent/workflows/plan-decomposer";
import type { DecomposedPlan } from "@/lib/agent/workflows/plan-decomposer";
import { inferTopicWithLLM, normalizeComposePlanArgs, parsePlanSeedFromText } from "@/lib/agent/workflows/plan-seed";
import type { AgentStreamController } from "@/lib/agent/stream-events";

import {
  findChecklistTimelineEvent,
  resolveChecklistGroupForAppend,
  resolveChecklistItem,
} from "../checklist-resolvers";
import { resolveDeleteRecordTarget } from "../tools/delete-record";

export type DryRunAndProposeStepParams = {
  autoApproval?: AutoApprovalContext;
  confirmedActionId: null | string;
  context: BuildContextStepResult["context"];
  conversationState?: unknown;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  payload: Payload;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    conversationState?: unknown;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  resolution: IntentResolution;
  stream?: AgentStreamController;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  turnAudit?: AgentTurnTrace;
  user: { id: number };
  userPreferences?: import("@/lib/agent/user-preferences").UserPreferences | null;
};

export type DryRunAndProposeStepNext = {
  approvedActionId?: string;
  conversationState?: unknown;
  executionApproved: boolean;
  isDirectAnswer: boolean;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

export type DryRunAndProposeStepResult =
  | { outcome: "early_exit"; response: AgentChatResponse }
  | { outcome: "execute"; data: DryRunAndProposeStepNext };

export const runDryRunAndProposeStep = async (params: DryRunAndProposeStepParams): Promise<DryRunAndProposeStepResult> => {
  const {
    autoApproval,
    confirmedActionId,
    context,
    conversationState,
    emitStatus,
    emitToken,
    payload,
    persistAgentTurn,
    pushTrace,
    resolution,
    stream,
    tokenUsage: tokenUsageIn,
    trace,
    turnAudit,
    user,
    userPreferences,
  } = params;

  let tokenUsage = tokenUsageIn;
  const persistDryRunTurn = (args: {
    assistantMessage: string;
    confidence?: number;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) =>
    persistAgentTurn({
      ...args,
      ...(conversationState !== undefined ? { conversationState } : {}),
    });
  const isDirectAnswer =
    resolution.intent.intent === "answer_question" ||
    isConversationalIntent(resolution.intent.intent) ||
    resolution.intent.intent === "clarify";

  if (!isDirectAnswer && !confirmedActionId) {
    const routerOutput =
      resolution.routerOutput ??
      normalizeRouterOutput({ arbitration: resolution.arbitration, intent: resolution.intent });

    let resolverStatus: import("@/lib/agent/resolver/target-resolver").TargetResolutionStatus | undefined;

    if (resolution.intent.intent === "delete_record") {
      const targetResult = await resolveDeleteTarget(resolution.intent.args, { payload });
      resolverStatus = targetResult.status;

      if (turnAudit) {
        Object.assign(turnAudit, recordResolverTrace(turnAudit, targetResult));
      }

      if (targetResult.status !== "unique") {
        const assistantMessage =
          targetResult.question ??
          (targetResult.status === "ambiguous" || targetResult.status === "multiple"
            ? "找到多个匹配目标，请明确指定要操作哪一个。"
            : "未找到匹配的目标，无法继续预览或执行。");
        pushTrace({
          detail: assistantMessage,
          id: "target-resolver-block",
          kind: "error",
          status: "error",
          title: "目标解析失败",
        });
        const updatedThread = await persistDryRunTurn({
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        return {
          outcome: "early_exit",
          response: {
            assistantMessage,
            confidence: resolution.intent.confidence,
            engine: resolution.engine,
            intent: "clarify",
            pendingAction: null,
            trace,
            threadId: updatedThread.id,
            tokenUsage,
            turnAudit,
          },
        };
      }
    }

    if (resolution.intent.intent === "modify_record") {
      const targetResult = await resolveModifyTarget(resolution.intent.args);
      resolverStatus = targetResult.status;

      if (turnAudit) {
        Object.assign(turnAudit, recordResolverTrace(turnAudit, targetResult));
      }

      if (targetResult.status !== "unique") {
        const assistantMessage =
          targetResult.question ??
          (targetResult.status === "ambiguous" || targetResult.status === "multiple"
            ? "找到多个匹配目标，请明确指定要修改哪一个。"
            : "未找到匹配的目标，无法继续预览或执行。");
        pushTrace({
          detail: assistantMessage,
          id: "target-resolver-block",
          kind: "error",
          status: "error",
          title: "目标解析失败",
        });
        const updatedThread = await persistDryRunTurn({
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        return {
          outcome: "early_exit",
          response: {
            assistantMessage,
            confidence: resolution.intent.confidence,
            engine: resolution.engine,
            intent: "clarify",
            pendingAction: null,
            trace,
            threadId: updatedThread.id,
            tokenUsage,
            turnAudit,
          },
        };
      }
    }

    const policy = evaluatePolicyGuard(routerOutput, {
      resolverStatus,
      userContext: { preferences: userPreferences, userId: user.id },
    });
    const policyGuardOutput = applyPolicyGuard({ resolverStatus, router: routerOutput });

    if (turnAudit) {
      Object.assign(turnAudit, recordPolicyTrace(turnAudit, policy));
      Object.assign(turnAudit, recordPolicyGuardOutputTrace(turnAudit, policyGuardOutput));
      if (resolution.llmRouterOutput) {
        const { buildToolPlan } = await import("@/lib/agent/plan/tool-plan");
        const rebuiltPlan = buildToolPlan({
          allowedCapabilities: policy.allowedCapabilities ?? [],
          resolverResult:
            resolverStatus && resolverStatus !== "unique"
              ? { question: null, resolved: null, status: resolverStatus }
              : undefined,
          router: resolution.llmRouterOutput,
        });
        Object.assign(turnAudit, recordToolPlanTrace(turnAudit, rebuiltPlan));
        resolution.toolPlan = rebuiltPlan;
      }
    }

    if (!policy.allowed) {
      const assistantMessage = `当前动作未通过安全策略：${policy.reason}。请换一种说法，或明确你要查询/创建/修改/删除的对象。`;
      pushTrace({
        detail: policy.reason,
        id: "policy-guard-block",
        kind: "error",
        status: "error",
        title: "Policy Guard 拒绝",
      });
      const updatedThread = await persistDryRunTurn({
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: "clarify",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
          turnAudit,
        },
      };
    }

    if (!policyGuardOutput.allowDryRun && routerOutput.requiresWrite) {
      const assistantMessage = `当前动作未通过 Policy Guard：${policyGuardOutput.reason}。请补充或澄清目标后再试。`;
      pushTrace({
        detail: policyGuardOutput.reason,
        id: "policy-guard-dry-run-block",
        kind: "error",
        status: "error",
        title: "Policy Guard 禁止 DryRun",
      });
      const updatedThread = await persistDryRunTurn({
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: "clarify",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
          turnAudit,
        },
      };
    }
  }

  if (resolution.intent.intent === "compose_plan" && !confirmedActionId) {
    const normalizedArgs = normalizeComposePlanArgs(
      resolution.intent.args as Parameters<typeof normalizeComposePlanArgs>[0],
    );

    const parsedSeed = parsePlanSeedFromText(normalizedArgs.sourceText || normalizedArgs.goal || "");
    if (!parsedSeed.topic && normalizedArgs.sourceText) {
      const llmTopic = await inferTopicWithLLM(normalizedArgs.sourceText);
      if (llmTopic) {
        (normalizedArgs as Record<string, unknown>).topic = llmTopic;
      }
    }

    emitStatus("正在分析你的目标并拆解阶段计划...");
    stream?.progress({
      detail: "compose_plan 需要先拆解目标、周期和阶段，再生成可确认草稿。",
      message: "拆解计划草稿",
      stageId: "stage-dry-run",
    });
    pushTrace({
      detail: "解析起止时间与学习节奏，并拆解为可执行阶段。",
      id: "plan-decompose-llm",
      kind: "analysis",
      status: "running",
      title: "正在拆解目标为阶段计划",
    });

    let llmDecomposed: DecomposedPlan | null = null;
    const decomposed = await decomposePlanForCompose(normalizedArgs, context, getAgentModelConfig);

    if (decomposed) {
      llmDecomposed = decomposed;
      pushTrace({
        detail: `已拆解为 ${decomposed.phases.length} 个阶段，预计 ${decomposed.totalEstimatedDays} 天。${decomposed.phases.map((p) => p.title).join(" → ")}`,
        id: "plan-decompose-llm",
        kind: "analysis",
        status: "done",
        title: `已拆解：${decomposed.phases.map((p) => p.title).join(" → ")}`,
      });
      emitToken(`• 已拆解为 ${decomposed.phases.length} 个阶段：${decomposed.phases.map((p) => p.title).join(" → ")}\n`, 'thinking');
      stream?.progress({
        detail: decomposed.phases.map((phase) => phase.title).join(" → "),
        message: `已拆解为 ${decomposed.phases.length} 个阶段`,
        stageId: "stage-dry-run",
      });
    } else {
      pushTrace({
        detail: "未能从描述中拆出具体阶段，将在确认前请你补充主题、周期或章节范围。",
        id: "plan-decompose-llm",
        kind: "analysis",
        status: "done",
        title: "拆解信息不足，需补充后再生成计划",
      });
      emitToken("• 拆解信息不足，将在确认前请你补充细节\n", 'thinking');
      stream?.progress({
        detail: "缺少主题、周期或章节范围。",
        message: "拆解信息不足",
        stageId: "stage-dry-run",
      });
    }

    resolution.intent.args = llmDecomposed
      ? ({ ...normalizedArgs, decomposed: llmDecomposed } as ComposePlanArgs)
      : normalizedArgs;
  }

  const normalizedConversationState = conversationState
    ? normalizeSessionState(conversationState)
    : null;
  const dryRunResult = confirmedActionId
    ? {
        type: "bypass" as const,
      }
    : await dryRunAgentIntent(resolution.intent, {
        detectScheduleConflicts: (args) =>
          detectScheduleConflicts(args.date, args.startTime, args.endTime, args.excludeId, payload),
        findLocalBusyBlocks: async ({ endDate, startDate }) => {
          const items = await getScheduleForDateRange(new Date(startDate), new Date(endDate), payload);

          return items
            .filter((item) => item.status !== "canceled")
            .map((item) => ({
              date: item.date,
              endTime: item.endTime ?? null,
              isAllDay: item.isAllDay ?? null,
              sourceId: item.id,
              startTime: item.startTime ?? null,
              title: item.title ?? null,
            }));
        },
        findTimelineEvent: findChecklistTimelineEvent,
        now: context.now,
        planCandidates: context.plans,
        promptContext: context,
        resolveChecklistGroupForAppend,
        resolveChecklistItem,
        resolveDeleteRecord: (args) => resolveDeleteRecordTarget(args, { payload }),
        resolveScheduleItem: (itemId) => getScheduleItemById(itemId, payload),
        scheduleSlots: normalizedConversationState?.scheduling?.slots ?? null,
      });

  if (turnAudit && dryRunResult.type !== "bypass") {
    Object.assign(turnAudit, recordDryRunTrace(turnAudit, dryRunResult));
  }

  if (dryRunResult.type === "clarify") {
    emitStatus("Dry-run 发现信息不完整，需要补充...");
    stream?.progress({
      detail: "安全门没有得到足够字段，转为澄清回复。",
      message: "预检需要补充信息",
      stageId: "stage-dry-run",
    });
    const assistantMessage = dryRunResult.assistantMessage;
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "组织澄清回复",
    });
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
    stream?.complete("stage-response", "澄清回复已生成");
    const outputTokens = estimateTokenCount(assistantMessage);
    tokenUsage = {
      ...tokenUsage,
      outputTokens,
      totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
    };
    pushTrace({
      detail: assistantMessage,
      id: "action-dry-run",
      kind: "analysis",
      status: "done",
      title: "Dry-run 未能唯一定位目标",
    });
    const updatedThread = await persistDryRunTurn({
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: "clarify",
      nextPendingAction: dryRunResult.pendingAction,
    });

    logAgentEvent("info", "chat.dry_run_clarify", {
      intent: resolution.intent.intent,
      pendingAction: dryRunResult.pendingAction?.type ?? null,
      threadId: updatedThread.id,
      userId: user.id,
    });

    return {
      outcome: "early_exit",
      response: {
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: "clarify",
        pendingAction: dryRunResult.pendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      },
    };
  }

  const proposedActionRaw =
    dryRunResult.type === "proposed_action" || dryRunResult.type === "bypass"
      ? dryRunResult.action ?? null
      : null;
  const proposedAction = proposedActionRaw ? attachCapabilityToProposedAction(proposedActionRaw) : null;

  if (proposedAction && proposedAction.requiresConfirmation === false) {
    const hasWriteChange =
      (proposedAction.affectedDocuments?.length ?? 0) > 0;

    return {
      outcome: "execute",
      data: {
        ...(hasWriteChange ? { approvedActionId: proposedAction.id } : {}),
        ...(conversationState !== undefined ? { conversationState } : {}),
        executionApproved: true,
        isDirectAnswer: false,
        tokenUsage,
      },
    };
  }

  if (proposedAction && autoApproval) {
    stream?.change({
      collections: Array.from(new Set(proposedAction.changes.map((change) => change.collection))),
      riskLevel: proposedAction.riskLevel,
      stageId: "stage-dry-run",
      summary: proposedAction.summary,
    });
    const prefs = autoApproval.userPreferences ?? null;
    const previouslyConfirmed = buildConfirmedIntentSet(autoApproval.pendingActionHistory, autoApproval.lastIntent);
    const decision = shouldAutoApprove(proposedAction, {
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
      void recordAutoApproval({
        action: proposedAction,
        reason: decision.reason,
        threadId: autoApproval.threadId,
        userId: user.id,
      });
      pushTrace({
        detail: `自动批准「${proposedAction.summary}」：${decision.reason}`,
        id: "action-dry-run",
        kind: "action",
        status: "done",
        title: `自动批准：${proposedAction.summary}`,
      });
      stream?.progress({
        detail: decision.reason,
        message: "低风险动作已自动批准",
        stageId: "stage-dry-run",
      });

      return {
        outcome: "execute",
        data: {
          approvedActionId: proposedAction.id,
          ...(conversationState !== undefined ? { conversationState } : {}),
          executionApproved: true,
          isDirectAnswer: false,
          tokenUsage,
        },
      };
    }
  }

  if (proposedAction) {
    emitStatus("正在执行 dry-run 预检，等待用户确认...");
    stream?.change({
      collections: Array.from(new Set(proposedAction.changes.map((change) => change.collection))),
      riskLevel: proposedAction.riskLevel,
      stageId: "stage-dry-run",
      summary: proposedAction.summary,
    });
    stream?.progress({
      detail: `risk=${proposedAction.riskLevel}`,
      message: "已生成待确认变更",
      stageId: "stage-dry-run",
    });
    const assistantMessage = buildProposedActionMessage(proposedAction);
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "生成确认说明",
    });
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
    stream?.complete("stage-response", "确认说明已生成");
    const nextPendingAction: PendingAction = {
      action: proposedAction,
      type: "await_confirmation",
    };
    const outputTokens = estimateTokenCount(assistantMessage);
    tokenUsage = {
      ...tokenUsage,
      outputTokens,
      totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
    };
    pushTrace({
      detail: `${proposedAction.summary} · risk=${proposedAction.riskLevel}`,
      id: "action-dry-run",
      kind: "action",
      status: "done",
      title: "Dry-run 已生成待确认动作",
    });
    const updatedThread = await persistDryRunTurn({
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      nextPendingAction,
    });

    logAgentEvent("info", "chat.confirmation_requested", {
      actionId: proposedAction.id,
      intent: proposedAction.intent,
      riskLevel: proposedAction.riskLevel,
      threadId: updatedThread.id,
      userId: user.id,
    });

    return {
      outcome: "early_exit",
      response: {
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: nextPendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      },
    };
  }

  if (!isDirectAnswer || confirmedActionId) {
    stream?.progress({
      detail: resolution.intent.intent,
      message: "预检通过，可进入执行",
      stageId: "stage-dry-run",
    });
  }

  return {
    outcome: "execute",
    data: {
      ...(conversationState !== undefined ? { conversationState } : {}),
      executionApproved: true,
      isDirectAnswer,
      tokenUsage,
    },
  };
};
