import { executeAgentIntent, executeAgentIntentsTransactional } from "@/lib/agent/executor";
import type { IntentResolution } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import type { StreamTokenCallback } from "@/lib/agent/client";
import { logAgentEvent } from "@/lib/agent/logger";
import { isRollbackPayloadExecutable } from "@/lib/agent/rollback-parse";
import type { AgentChatResponse, AgentEngine, AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { getAgentToolDefinition } from "@/lib/agent/tool-registry";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";

export type ExecuteAndPersistStepParams = {
  batchExecuteIntents?: AgentIntent[];
  confirmedActionId: null | string;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  executionApproved?: boolean;
  isDirectAnswer: boolean;
  nextPendingAfterExecute?: null | PendingAction;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  resolution: IntentResolution;
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
    emitStatus,
    emitToken,
    executionApproved = false,
    isDirectAnswer,
    nextPendingAfterExecute,
    persistAgentTurn,
    pushTrace,
    resolution,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;

  if (batchExecuteIntents && batchExecuteIntents.length > 0) {
    emitStatus(`正在批量执行 ${batchExecuteIntents.length} 项操作...`);
    let lastPending: PendingAction | null = null;

    pushTrace({
      detail: `按事务顺序执行 ${batchExecuteIntents.length} 项写操作；若中途失败，将自动补偿已完成动作。`,
      id: "batch-execute-transactional",
      kind: "action",
      status: "running",
      title: `事务批量执行 (${batchExecuteIntents.length})`,
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
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
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
    const assistantMessage = buildUnconfirmedExecutionMessage(resolution.intent);
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
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

  const execution = await executeAgentIntent(resolution.intent, pushTrace, {
    userId: user.id,
  });
  const resolvedPending = execution.pendingAction ?? nextPendingAfterExecute ?? null;
  const assistantMessage =
    nextPendingAfterExecute && !execution.pendingAction
      ? `${execution.assistantMessage}\n\n${describePendingActionForExecution(nextPendingAfterExecute)}`
      : execution.assistantMessage;
  if (!isDirectAnswer && assistantMessage) {
    for (const token of splitIntoWordTokens(assistantMessage)) {
      emitToken(token, 'response');
      await new Promise((r) => setTimeout(r, 6));
    }
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

  const updatedThread = await persistAgentTurn({
    assistantMessage,
    confidence: resolution.intent.confidence,
    engine: resolution.engine,
    intent: resolution.intent.intent,
    nextPendingAction: resolvedPending,
  });

  logAgentEvent("info", "chat.intent_executed", {
    confirmedActionId,
    intent: resolution.intent.intent,
    pendingAction: resolvedPending?.type ?? null,
    threadId: updatedThread.id,
    userId: user.id,
  });

  return {
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
