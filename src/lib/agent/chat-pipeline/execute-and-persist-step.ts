import { executeAgentIntent } from "@/lib/agent/executor";
import type { IntentResolution } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import { logAgentEvent } from "@/lib/agent/logger";
import { isRollbackPayloadExecutable } from "@/lib/agent/rollback-parse";
import type { AgentChatResponse, AgentEngine, AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";

export type ExecuteAndPersistStepParams = {
  confirmedActionId: null | string;
  emitStatus: (status: string) => void;
  isDirectAnswer: boolean;
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

export const runExecuteAndPersistStep = async (params: ExecuteAndPersistStepParams): Promise<AgentChatResponse> => {
  const {
    confirmedActionId,
    emitStatus,
    isDirectAnswer,
    persistAgentTurn,
    pushTrace,
    resolution,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;

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

  const execution = await executeAgentIntent(resolution.intent, pushTrace);
  const lastRollbackPayload =
    "rollbackPayload" in execution && execution.rollbackPayload && isRollbackPayloadExecutable(execution.rollbackPayload)
      ? execution.rollbackPayload
      : undefined;
  const outputTokens = estimateTokenCount(execution.assistantMessage);
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
    assistantMessage: execution.assistantMessage,
    confidence: resolution.intent.confidence,
    engine: resolution.engine,
    intent: resolution.intent.intent,
    nextPendingAction: execution.pendingAction,
  });

  logAgentEvent("info", "chat.intent_executed", {
    confirmedActionId,
    intent: resolution.intent.intent,
    pendingAction: execution.pendingAction?.type ?? null,
    threadId: updatedThread.id,
    userId: user.id,
  });

  return {
    assistantMessage: execution.assistantMessage,
    confidence: resolution.intent.confidence,
    engine: resolution.engine,
    intent: resolution.intent.intent,
    lastRollbackPayload,
    pendingAction: execution.pendingAction,
    trace,
    threadId: updatedThread.id,
    tokenUsage,
  };
};
