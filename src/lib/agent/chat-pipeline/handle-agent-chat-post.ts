import "server-only";

import { NextResponse } from "next/server";
import type { Payload } from "payload";

import { createRunAgentChatPipeline } from "@/lib/agent/chat-pipeline/run-agent-chat-pipeline";
import { parseStructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import { createAgentChatResponse, createAgentChatStream } from "@/lib/agent/chat-pipeline/stream-envelope";
import { generateIntentWithAgentModel, getAgentIntentModelEngine } from "@/lib/agent/client";
import { isCancellationReply, shouldSkipPendingAction } from "@/lib/agent/intent-resolution";
import { logAgentEvent } from "@/lib/agent/logger";
import { parsePendingAction, sanitizeChatMessages } from "@/lib/agent/schemas";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import {
  appendAgentThreadTurn,
  getOrCreateAgentThread,
  getThreadMessages,
  getThreadPendingAction,
  removeCurrentMessageFromHistory,
} from "@/lib/agent/thread";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
  estimateTokenCount,
} from "@/lib/agent/token-usage";
import { getUserPreferences } from "@/lib/agent/user-preferences";
import { getPayloadClient } from "@/lib/payload/client";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseThreadId = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const WORKBENCH_MODES = ["ask", "execute", "plan", "review", "timeline"] as const satisfies readonly AgentWorkbenchMode[];

const parseWorkbenchMode = (value: unknown): AgentWorkbenchMode | null => {
  if (typeof value !== "string") {
    return null;
  }

  return (WORKBENCH_MODES as readonly string[]).includes(value) ? (value as AgentWorkbenchMode) : null;
};

export type ContextPreferences = {
  excluded: string[];
  pinned: string[];
};

const parseContextPreferences = (value: unknown): ContextPreferences | null => {
  if (!isRecord(value)) {
    return null;
  }

  const pinned = Array.isArray(value.pinned)
    ? value.pinned.filter((item): item is string => typeof item === "string")
    : [];
  const excluded = Array.isArray(value.excluded)
    ? value.excluded.filter((item): item is string => typeof item === "string")
    : [];

  if (pinned.length === 0 && excluded.length === 0) {
    return null;
  }

  return { excluded, pinned };
};

export type AgentChatPostUser = { id: number };

/**
 * 鉴权之后的 HTTP 入口：解析 body、建线程、处理「跳过待办」短路与主管线，返回 JSON 或 SSE。
 */
export const handleAgentChatPost = async (input: { body: unknown; user: AgentChatPostUser }) => {
  const { body, user } = input;

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        assistantMessage: "请求体格式不正确。",
      },
      { status: 400 },
    );
  }

  const payload = await getPayloadClient();
  const structuredConfirmation = parseStructuredConfirmation(body);
  const messageRaw = typeof body.message === "string" ? body.message.trim() : "";
  const syntheticMessage =
    structuredConfirmation?.type === "confirm"
      ? "确认"
      : structuredConfirmation?.type === "cancel"
        ? "取消"
        : "";
  const message = messageRaw || syntheticMessage;

  if (!message) {
    return NextResponse.json(
      {
        assistantMessage: "请输入一条要交给 Agent 处理的话，或发送结构化确认请求。",
      },
      { status: 400 },
    );
  }

  const shouldStream = body.stream === true;
  const workbenchMode = parseWorkbenchMode(body.workbenchMode);
  const contextPreferences = parseContextPreferences(body.contextPreferences);

  const history = sanitizeChatMessages(body.messages);
  logAgentEvent("info", "chat.request", {
    historyLength: history.length,
    messageLength: message.length,
    stream: shouldStream,
    userId: user.id,
    workbenchMode: workbenchMode ?? undefined,
  });
  const thread = await getOrCreateAgentThread({
    firstMessage: message,
    threadId: parseThreadId(body.threadId),
    userId: user.id,
  });
  const storedHistory = getThreadMessages(thread);
  const clientHistory = removeCurrentMessageFromHistory(history, message);
  const resolvedHistory = (storedHistory.length > 0 ? storedHistory : clientHistory).slice(-12);
  const pendingAction = getThreadPendingAction(thread) ?? parsePendingAction(body.pendingAction);
  const baseTokenUsage = createTokenUsageSnapshot({
    contextTokens: estimateMessagesTokenCount(resolvedHistory) + estimateTokenCount(pendingAction),
    inputTokens: estimateTokenCount(message),
  });

  if (
    pendingAction?.type === "await_batch_confirmation" &&
    isCancellationReply(message)
  ) {
    const assistantMessage = `好的，已取消这 ${pendingAction.actions.length} 项批量待确认操作。你可以重新描述要做的变更。`;
    const tokenUsage = {
      ...baseTokenUsage,
      outputTokens: estimateTokenCount(assistantMessage),
      totalTokens:
        baseTokenUsage.contextTokens + baseTokenUsage.inputTokens + estimateTokenCount(assistantMessage),
    };

    await appendAgentThreadTurn({
      assistantMessage,
      confidence: 1,
      engine: "workflow",
      intent: "clarify",
      pendingAction: null,
      thread,
      userMessage: message,
    });
    logAgentEvent("info", "chat.batch_confirmation_cancelled", {
      threadId: thread.id,
      userId: user.id,
    });

    return createAgentChatResponse(
      {
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        pendingAction: null,
        threadId: thread.id,
        tokenUsage,
      },
      shouldStream,
    );
  }

  if (shouldSkipPendingAction(pendingAction, message)) {
    const assistantMessage =
      pendingAction.type === "await_completion_note"
        ? "好的，这次先不补备注。你接下来也可以直接继续给我新的计划或完成记录。"
        : "好的，这次先不继续这个待澄清动作。你接下来可以直接给我新的计划、清单或进度指令。";
    const tokenUsage = {
      ...baseTokenUsage,
      outputTokens: estimateTokenCount(assistantMessage),
      totalTokens:
        baseTokenUsage.contextTokens + baseTokenUsage.inputTokens + estimateTokenCount(assistantMessage),
    };

    await appendAgentThreadTurn({
      assistantMessage,
      confidence: 1,
      engine: "workflow",
      intent: "clarify",
      pendingAction: null,
      thread,
      userMessage: message,
    });
    logAgentEvent("info", "chat.pending_action_skipped", {
      threadId: thread.id,
      userId: user.id,
    });

    return createAgentChatResponse(
      {
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        pendingAction: null,
        threadId: thread.id,
        tokenUsage,
      },
      shouldStream,
    );
  }

  // Persist the user message to the thread before the pipeline runs.
  // If the pipeline errors or times out, the message still survives in the DB
  // instead of vanishing from the conversation.
  const recordedAt = new Date().toISOString();
  const persistedMessages = [
    ...(thread.messages ?? []).map((m) => ({
      content: m.content,
      recordedAt: typeof m.recordedAt === "string" ? m.recordedAt : undefined,
      role: m.role,
    })),
    { content: message, recordedAt, role: "user" as const },
  ].slice(-40);
  await payload.update({
    collection: "agent-threads",
    data: { messages: persistedMessages },
    id: thread.id,
    overrideAccess: true,
  });

  const intentModelEngine = await getAgentIntentModelEngine();
  const userPreferences = await getUserPreferences(user.id);
  const runPipeline = createRunAgentChatPipeline({
    baseTokenUsage,
    contextPreferences,
    generateIntentWithAgentModel,
    intentModelEngine,
    message,
    payload: payload as unknown as Payload,
    pendingAction,
    resolvedHistory,
    structuredConfirmation,
    thread,
    user,
    userPreferences,
    workbenchMode,
  });

  if (shouldStream) {
    return createAgentChatStream(runPipeline);
  }

  try {
    return NextResponse.json(await runPipeline());
  } catch (error) {
    logAgentEvent("error", "chat.pipeline_error", {
      error: error instanceof Error ? error.message : String(error),
      threadId: thread.id,
      userId: user.id,
    });

    return NextResponse.json(
      {
        assistantMessage: "处理请求时遇到内部错误，请稍后重试。",
        confidence: 0,
        engine: "workflow" as const,
        intent: "clarify",
        pendingAction: null,
        threadId: thread.id,
        tokenUsage: baseTokenUsage,
      },
      { status: 500 },
    );
  }
};
