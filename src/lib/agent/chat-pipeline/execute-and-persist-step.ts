import { appendFileSync } from "node:fs";

import { getAgentDebugLogPath } from "@/lib/agent/debug-log";
import { executeAgentIntent, executeAgentIntentsTransactional } from "@/lib/agent/executor";
import type { IntentResolution } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import type { StructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import type { StreamTokenCallback } from "@/lib/agent/client";
import { applyPolicyGuard } from "@/lib/agent/policy/guard";
import { normalizeRouterOutput } from "@/lib/agent/router/normalize-router-output";
import {
  capabilityForLegacyIntent,
  executeCapabilityForPreview,
  runExecuteCapability,
} from "@/lib/agent/capabilities/adapters";
import type { AgentWriteIntentName } from "@/lib/agent/schemas";
import { logAgentEvent } from "@/lib/agent/logger";
import { isRollbackPayloadExecutable } from "@/lib/agent/rollback-parse";
import type { AgentChatResponse, AgentEngine, AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { getAgentToolDefinition } from "@/lib/agent/tool-registry";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";
import type { AgentStreamController } from "@/lib/agent/stream-events";
import { resolveCreatedPlanConversationState } from "@/lib/agent/planning/created-plan-lifecycle";
import type { AgentTraceRecorder } from "@/lib/agent/trace";

export type ExecuteAndPersistStepParams = {
  batchExecuteIntents?: AgentIntent[];
  confirmedActionId: null | string;
  conversationState?: unknown;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  executionApproved?: boolean;
  executedCapability?: (name: string) => void;
  isDirectAnswer: boolean;
  nextPendingAfterExecute?: null | PendingAction;
  pendingAction?: null | PendingAction;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    conversationState?: unknown;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  recordBackendTrace?: AgentTraceRecorder;
  resolution: IntentResolution;
  stream?: AgentStreamController;
  structuredConfirmation?: null | StructuredConfirmation;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { id: number };
};

const requiresConfirmationBeforeExecution = (intent: AgentIntent) =>
  getAgentToolDefinition(intent.intent)?.requiresConfirmation === true;

const buildUnconfirmedExecutionMessage = (intent: AgentIntent) =>
  `这个动作「${intent.intent}」需要先完成 Dry-run 预览并得到确认，我不会直接写入数据库。请重新发送这条请求，Agent 会先生成可确认的变更卡片；确认后才会执行。`;

const describePendingActionForExecution = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_batch_confirmation") {
    return `另有 ${pendingAction.actions.length} 项操作待批量确认，请回复「确认」执行。`;
  }

  if (pendingAction.type === "await_queue_resume") {
    return `另有 ${pendingAction.deferredTaskIds.length} 个子任务已延后，请回复「继续」恢复执行。`;
  }

  if (pendingAction.type === "await_confirmation") {
    return `另有 1 项操作待确认：${pendingAction.action.summary}。`;
  }

  if (pendingAction.type === "await_learning_followup") {
    return `我保留了「${pendingAction.subject}」的学习咨询上下文，你可以继续说“拆成学习计划”。`;
  }

  return "还有一步需要你补充信息后才能继续。";
};

export const runExecuteAndPersistStep = async (params: ExecuteAndPersistStepParams): Promise<AgentChatResponse> => {
  const {
    batchExecuteIntents,
    confirmedActionId,
    conversationState,
    emitStatus,
    emitToken,
    executionApproved = false,
    executedCapability,
    isDirectAnswer,
    nextPendingAfterExecute,
    pendingAction = null,
    persistAgentTurn,
    pushTrace,
    recordBackendTrace,
    resolution,
    stream,
    structuredConfirmation = null,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;
  const errorSummaryForTrace = (error: unknown) => ({
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.name ? { name: error.name } : {}),
  });

  // #region agent log
  if (process.env.AGENT_DEBUG_LOG) {
    try {
      appendFileSync(
        getAgentDebugLogPath(),
        `${JSON.stringify({
          sessionId: "961715",
          location: "execute-and-persist-step.ts:entry",
          message: "execute step entered",
          data: {
            isDirectAnswer,
            intent: resolution.intent.intent,
            replyLen: "reply" in resolution.intent ? resolution.intent.reply?.length ?? null : null,
          },
          timestamp: Date.now(),
          hypothesisId: "H12-H13",
          runId: "post-fix-3",
        })}\n`,
      );
    } catch {
      // ignore debug log failures
    }
  }
  // #endregion

  if (batchExecuteIntents && batchExecuteIntents.length > 0) {
    emitStatus(`正在批量执行 ${batchExecuteIntents.length} 项操作...`);
    stream?.progress({
      detail: batchExecuteIntents.map((intent) => intent.intent).join(" → "),
      message: `批量执行 ${batchExecuteIntents.length} 项操作`,
      stageId: "stage-execution",
    });
    let lastPending: PendingAction | null = null;

    pushTrace({
      detail: `按事务顺序执行 ${batchExecuteIntents.length} 项写操作；若中途失败，将自动补偿已完成动作。`,
      id: "batch-execute-transactional",
      kind: "action",
      status: "running",
      title: `事务批量执行 (${batchExecuteIntents.length})`,
    });
    const batchStartedAt = Date.now();
    recordBackendTrace?.({
      inputPreview: {
        count: batchExecuteIntents.length,
        intents: batchExecuteIntents.map((intent) => intent.intent),
        operation: "execute",
      },
      phase: "execute",
      status: "started",
      title: "开始批量执行已确认动作",
      toolName: "execute_batch",
    });
    const batchResult = await executeAgentIntentsTransactional(batchExecuteIntents, pushTrace, {
      userId: user.id,
    });
    const batchFailed = batchResult.status === "failed";
    lastPending = batchResult.pendingAction ?? (batchFailed ? null : nextPendingAfterExecute ?? null);
    const assistantMessage =
      nextPendingAfterExecute && !batchResult.pendingAction && !batchFailed
        ? `${batchResult.assistantMessage}\n\n${describePendingActionForExecution(nextPendingAfterExecute)}`
        : batchResult.assistantMessage;
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "生成执行结果",
    });
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
    stream?.complete("stage-response", batchFailed ? "执行失败说明已生成" : "执行结果已生成");
    pushTrace({
      detail: assistantMessage.slice(0, 120),
      id: "batch-execute-transactional",
      kind: batchFailed ? "error" : "complete",
      status: batchFailed ? "error" : "done",
      title: batchFailed
        ? `批量执行已中止 (${batchExecuteIntents.length})`
        : `批量执行完成 (${batchExecuteIntents.length})`,
    });
    const outputTokens = estimateTokenCount(assistantMessage);
    tokenUsage = {
      ...tokenUsage,
      outputTokens,
      totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
    };
    const updatedThread = await persistAgentTurn({
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      nextPendingAction: lastPending,
    });
    recordBackendTrace?.({
      latencyMs: Date.now() - batchStartedAt,
      outputPreview: {
        count: batchExecuteIntents.length,
        pendingActionType: lastPending?.type ?? null,
        status: batchResult.status,
      },
      phase: "execute",
      status: batchFailed ? "failed" : "success",
      title: batchFailed ? "批量执行已中止" : "批量执行完成",
      toolName: "execute_batch",
    });
    if (!batchFailed) {
      recordBackendTrace?.({
        outputPreview: {
          threadId: updatedThread.id,
        },
        phase: "receipt",
        status: "success",
        summary: "批量执行结果已经通过现有 Agent turn / receipt 链路记录。",
        title: "已记录批量执行结果",
        toolName: "execute_batch",
      });
    }

    logAgentEvent("info", "chat.batch_executed", {
      count: batchExecuteIntents.length,
      threadId: updatedThread.id,
      userId: user.id,
    });

    return {
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      lastRollbackPayload:
        "rollbackPayload" in batchResult &&
        batchResult.rollbackPayload &&
        isRollbackPayloadExecutable(batchResult.rollbackPayload)
          ? batchResult.rollbackPayload
          : undefined,
      pendingAction: lastPending,
      trace,
      threadId: updatedThread.id,
      tokenUsage,
    };
  }

  if (
    !isDirectAnswer &&
    !confirmedActionId &&
    !executionApproved &&
    requiresConfirmationBeforeExecution(resolution.intent)
  ) {
    emitStatus("写操作缺少确认，已阻止直接执行...");
    stream?.progress({
      detail: resolution.intent.intent,
      message: "确认边界阻止写入",
      stageId: "stage-execution",
    });
    const assistantMessage = buildUnconfirmedExecutionMessage(resolution.intent);
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "生成安全提示",
    });
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
    stream?.complete("stage-response", "安全提示已生成");
    const outputTokens = estimateTokenCount(assistantMessage);
    tokenUsage = {
      ...tokenUsage,
      outputTokens,
      totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
    };
    pushTrace({
      detail: `intent=${resolution.intent.intent}`,
      id: "execution-confirmation-guard",
      kind: "error",
      status: "error",
      title: "未确认写操作已被阻止",
    });
    const updatedThread = await persistAgentTurn({
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      nextPendingAction: null,
    });

    logAgentEvent("warn", "chat.unconfirmed_write_blocked", {
      intent: resolution.intent.intent,
      threadId: updatedThread.id,
      userId: user.id,
    });

    return {
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      pendingAction: null,
      trace,
      threadId: updatedThread.id,
      tokenUsage,
    };
  }

  emitStatus(isDirectAnswer ? "正在组织回复内容..." : "正在执行写入操作...");
  stream?.progress({
    detail: isDirectAnswer
      ? "这轮回答已在仲裁阶段生成，当前只做执行与持久化收尾。"
      : `intent=${resolution.intent.intent}`,
    message: isDirectAnswer ? "保存回答上下文" : "执行工具动作",
    stageId: isDirectAnswer ? "stage-response" : "stage-execution",
  });
  pushTrace({
    detail: isDirectAnswer
      ? "这轮只生成回答，不会写入计划、清单或时间线。"
      : confirmedActionId
        ? "这一步已经收到确认，可以继续执行写入动作。"
        : "接下来会根据识别出的意图执行查询、更新或同步动作。",
    id: "action-execute",
    kind: "action",
    status: "running",
    title: isDirectAnswer ? "准备生成回答" : "准备执行对应动作",
  });

  if (!isDirectAnswer && (confirmedActionId || executionApproved)) {
    const routerOutput =
      resolution.routerOutput ??
      normalizeRouterOutput({ arbitration: resolution.arbitration, intent: resolution.intent });
    const policyGuardOutput = applyPolicyGuard({ router: routerOutput });

    if (!policyGuardOutput.allowExecute) {
      const assistantMessage = `该操作尚未通过 execute Policy Guard：${policyGuardOutput.reason}`;
      pushTrace({
        detail: policyGuardOutput.reason,
        id: "policy-guard-execute-block",
        kind: "error",
        status: "error",
        title: "Policy Guard 禁止 Execute",
      });
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        nextPendingAction: null,
      });

      return {
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: null,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      };
    }
  }

  const shouldTraceWriteExecution =
    !isDirectAnswer && (confirmedActionId !== null || executionApproved);
  const pendingProposal =
    pendingAction?.type === "await_confirmation" && pendingAction.action.id === confirmedActionId
      ? pendingAction.action
      : null;
  const previewCapability =
    pendingProposal?.capability ??
    structuredConfirmation?.capability ??
    capabilityForLegacyIntent(resolution.intent.intent as AgentWriteIntentName, "preview");
  const executeCapability =
    previewCapability && executeCapabilityForPreview(previewCapability)
      ? executeCapabilityForPreview(previewCapability)
      : capabilityForLegacyIntent(resolution.intent.intent as AgentWriteIntentName, "execute");
  const executeToolName =
    executeCapability ?? `execute:${resolution.intent.intent}`;
  const executeStartedAt = Date.now();

  if (shouldTraceWriteExecution) {
    recordBackendTrace?.({
      actionId: confirmedActionId ?? undefined,
      inputPreview: {
        args: pendingProposal?.args ?? resolution.intent.args,
        operation: "execute",
      },
      intent: resolution.intent.intent,
      phase: "execute",
      status: "started",
      title: "开始执行已确认动作",
      toolName: executeToolName,
    });
    recordBackendTrace?.({
      actionId: confirmedActionId ?? undefined,
      inputPreview: {
        args: pendingProposal?.args ?? resolution.intent.args,
        operation: "execute",
      },
      intent: resolution.intent.intent,
      phase: "tool_call",
      status: "started",
      title: "调用 Execute 工具",
      toolName: executeToolName,
    });
  }

  let execution: Awaited<ReturnType<typeof executeAgentIntent>>;
  try {
    if (
      !isDirectAnswer &&
      (confirmedActionId || executionApproved) &&
      executeCapability &&
      pendingProposal
    ) {
      const capabilityResult = await runExecuteCapability(executeCapability, pendingProposal.args ?? {}, {
        confirmedPreviewId: confirmedActionId,
        pendingAction: pendingProposal,
        structuredCapability: structuredConfirmation?.capability ?? null,
        userId: user.id,
      });

      if (!capabilityResult.ok) {
        const assistantMessage = capabilityResult.summary;
        const latencyMs = Date.now() - executeStartedAt;
        recordBackendTrace?.({
          actionId: confirmedActionId ?? undefined,
          error: {
            message: capabilityResult.error ?? capabilityResult.summary,
          },
          intent: resolution.intent.intent,
          latencyMs,
          phase: "tool_call",
          status: "failed",
          title: "Execute 工具校验失败",
          toolName: executeToolName,
        });
        recordBackendTrace?.({
          actionId: confirmedActionId ?? undefined,
          error: {
            message: capabilityResult.error ?? capabilityResult.summary,
          },
          intent: resolution.intent.intent,
          latencyMs,
          phase: "execute",
          status: "failed",
          title: "Execute 已阻止",
          toolName: executeToolName,
        });
        pushTrace({
          detail: capabilityResult.error ?? capabilityResult.summary,
          id: "capability-execute-block",
          kind: "error",
          status: "error",
          title: "Execute 能力校验失败",
        });
        const updatedThread = await persistAgentTurn({
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: resolution.intent.intent,
          nextPendingAction: null,
        });

        return {
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: resolution.intent.intent,
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        };
      }

      executedCapability?.(executeCapability);
      execution = {
        ...(capabilityResult.data && typeof capabilityResult.data === "object" && !Array.isArray(capabilityResult.data)
          ? capabilityResult.data
          : {}),
        assistantMessage: capabilityResult.summary,
        pendingAction: null,
        status: "completed",
      };
    } else {
      execution = await executeAgentIntent(resolution.intent, pushTrace, {
        userId: user.id,
      });

      if (executeCapability && (confirmedActionId || executionApproved)) {
        executedCapability?.(executeCapability);
      }
    }
  } catch (error) {
    if (shouldTraceWriteExecution) {
      const latencyMs = Date.now() - executeStartedAt;
      const errorSummary = errorSummaryForTrace(error);
      recordBackendTrace?.({
        actionId: confirmedActionId ?? undefined,
        error: errorSummary,
        intent: resolution.intent.intent,
        latencyMs,
        phase: "tool_call",
        status: "failed",
        title: "Execute 工具调用失败",
        toolName: executeToolName,
      });
      recordBackendTrace?.({
        actionId: confirmedActionId ?? undefined,
        error: errorSummary,
        intent: resolution.intent.intent,
        latencyMs,
        phase: "execute",
        status: "failed",
        title: "Execute 失败",
        toolName: executeToolName,
      });
    }

    throw error;
  }

  if (shouldTraceWriteExecution) {
    const latencyMs = Date.now() - executeStartedAt;
    recordBackendTrace?.({
      actionId: confirmedActionId ?? undefined,
      intent: resolution.intent.intent,
      latencyMs,
      outputPreview: {
        hasRollbackPayload: "rollbackPayload" in execution,
        pendingActionType: execution.pendingAction?.type ?? null,
        status: execution.status,
      },
      phase: "tool_call",
      status: "success",
      title: "Execute 工具调用完成",
      toolName: executeToolName,
    });
    recordBackendTrace?.({
      actionId: confirmedActionId ?? undefined,
      intent: resolution.intent.intent,
      latencyMs,
      outputPreview: {
        pendingActionType: execution.pendingAction?.type ?? null,
        status: execution.status,
      },
      phase: "execute",
      status: "success",
      title: "已执行写入动作",
      toolName: executeToolName,
    });
  }
  const resolvedPending = execution.pendingAction ?? nextPendingAfterExecute ?? null;
  let assistantMessage =
    nextPendingAfterExecute && !execution.pendingAction
      ? `${execution.assistantMessage}\n\n${describePendingActionForExecution(nextPendingAfterExecute)}`
      : execution.assistantMessage;
  if (
    !assistantMessage?.trim() &&
    "reply" in resolution.intent &&
    typeof resolution.intent.reply === "string" &&
    resolution.intent.reply.trim().length > 0
  ) {
    assistantMessage = resolution.intent.reply;
  }
  // #region agent log
  if (process.env.AGENT_DEBUG_LOG) {
    try {
      appendFileSync(
        getAgentDebugLogPath(),
        `${JSON.stringify({
          sessionId: "961715",
          location: "execute-and-persist-step.ts:assistantMessage",
          message: "final assistant message",
          data: {
            isDirectAnswer,
            intent: resolution.intent.intent,
            openDomainTopic:
              resolution.intent.intent === "answer_question"
                ? resolution.intent.args.openDomainTopic ?? null
                : null,
            replyLen: resolution.intent.reply?.length ?? null,
            answerLen:
              resolution.intent.intent === "answer_question"
                ? resolution.intent.args.answer.length
                : null,
            assistantMessageLen: assistantMessage?.length ?? 0,
          },
          timestamp: Date.now(),
          hypothesisId: "H3-H4",
          runId: "post-fix-2",
        })}\n`,
      );
    } catch {
      // ignore debug log failures
    }
  }
  // #endregion
  if (!isDirectAnswer && assistantMessage) {
    stream?.start({
      id: "stage-response",
      phase: "response",
      title: "生成执行结果",
    });
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
    stream?.complete("stage-response", "执行结果已生成");
  }
  const lastRollbackPayload =
    "rollbackPayload" in execution && execution.rollbackPayload && isRollbackPayloadExecutable(execution.rollbackPayload)
      ? execution.rollbackPayload
      : undefined;
  const outputTokens = estimateTokenCount(assistantMessage);
  tokenUsage = {
    ...tokenUsage,
    outputTokens,
    totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
  };
  pushTrace({
    detail: execution.pendingAction
      ? "当前动作已执行，但还需要你补充下一步信息。"
      : isDirectAnswer
        ? "回答已生成，正在把对话写回会话线程。"
        : "当前动作已执行完成，正在把结果写回会话线程。",
    id: "action-execute",
    kind: "action",
    status: "done",
    title: execution.pendingAction ? "动作已执行，进入待补信息状态" : isDirectAnswer ? "回答生成完成" : "动作执行完成",
  });

  const nextConversationState =
    resolveCreatedPlanConversationState({
      execution,
      intent: resolution.intent.intent,
      sessionState: conversationState,
    }) ?? conversationState;
  const updatedThread = await persistAgentTurn({
    assistantMessage,
    confidence: resolution.intent.confidence,
    ...(nextConversationState !== undefined ? { conversationState: nextConversationState } : {}),
    engine: resolution.engine,
    intent: resolution.intent.intent,
    nextPendingAction: resolvedPending,
  });
  if (shouldTraceWriteExecution) {
    recordBackendTrace?.({
      actionId: confirmedActionId ?? undefined,
      intent: resolution.intent.intent,
      outputPreview: {
        pendingActionType: resolvedPending?.type ?? null,
        threadId: updatedThread.id,
      },
      phase: "receipt",
      status: "success",
      summary: "执行结果已经通过现有 Agent turn / receipt 链路记录。",
      title: "已记录执行结果",
      toolName: executeToolName,
    });
  }

  logAgentEvent("info", "chat.intent_executed", {
    confirmedActionId,
    intent: resolution.intent.intent,
    pendingAction: resolvedPending?.type ?? null,
    threadId: updatedThread.id,
    userId: user.id,
  });

  return {
    ...(execution.affectedDocuments ? { affectedDocuments: execution.affectedDocuments } : {}),
    assistantMessage,
    confidence: resolution.intent.confidence,
    engine: resolution.engine,
    intent: resolution.intent.intent,
    lastRollbackPayload,
    pendingAction: resolvedPending,
    trace,
    threadId: updatedThread.id,
    tokenUsage,
  };
};
