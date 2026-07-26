import "server-only";

import { NextResponse } from "next/server";
import type { Payload } from "payload";

import { createRunAgentChatPipeline } from "@/lib/agent/chat-pipeline/run-agent-chat-pipeline";
import { parseStructuredConfirmation } from "@/lib/agent/chat-pipeline/confirmation-step";
import {
  createAgentChatResponse,
  createAgentChatStream,
} from "@/lib/agent/chat-pipeline/stream-envelope";
import { generateIntentWithAgentModel, getAgentIntentModelEngine } from "@/lib/agent/client";
import { getAgentGraphRuntimeConfig } from "@/lib/agent/langgraph/config";
import { createAgentRuntimeRunner } from "@/lib/agent/langgraph/dispatcher";
import { buildLangGraphFailureResponse } from "@/lib/agent/langgraph/failure-response";
import { createRunProductionLangGraphAgentChatPipeline } from "@/lib/agent/langgraph/production-adapter";
import { logAgentEvent } from "@/lib/agent/logger";
import { runAgentLearningLoop } from "@/lib/agent/learning-loop";
import {
  createModelCallBudgetRecorder,
  projectModelCallBudget,
} from "@/lib/agent/orchestration/model-call-budget";
import { resolveConversationState } from "@/lib/agent/conversation/conversation-state";
import { parsePendingAction, sanitizeChatMessages } from "@/lib/agent/schemas";
import {
  claimAgentTurn,
  createPayloadAgentThreadEventStore,
  ensureLegacyThreadEvents,
  hydrateAgentThreadState,
  type AgentSuggestionTurnSource,
} from "@/lib/agent/thread-events";
import { createAgentTurnFinalizer } from "@/lib/agent/turn-finalizer";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import {
  getOrCreateAgentThread,
  getThreadPendingAction,
  removeCurrentMessageFromHistory,
} from "@/lib/agent/thread";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
  estimateTokenCount,
} from "@/lib/agent/token-usage";
import { getUserPreferences } from "@/lib/agent/user-preferences";
import { createPerformanceTimer, isPerfTraceEnabled } from "@/lib/agent/trace/perf-trace";
import { isSessionCoordinatorEnabled } from "@/lib/agent/session/coordinator-feature-flag";
import { isQueryStreamFailure } from "@/lib/agent/query/errors";
import { isConversationalAnswerStreamFailure } from "@/lib/agent/answer/errors";
import { getPayloadClient } from "@/lib/payload/client";
import { isRecord } from "@/lib/shared/is-record";

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

const WORKBENCH_MODES = ["answer", "ask", "execute", "plan", "review", "timeline", "today", "writing"] as const satisfies readonly AgentWorkbenchMode[];

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

const parseSuggestionSource = (body: Record<string, unknown>): AgentSuggestionTurnSource | null => {
  const suggestionId = parseThreadId(body.suggestionId);
  const suggestedPrompt =
    typeof body.suggestedPrompt === "string" ? body.suggestedPrompt.trim() : "";

  if (!suggestionId || !suggestedPrompt) {
    return null;
  }

  return {
    suggestedPrompt,
    suggestionId,
  };
};

export type AgentChatPostUser = { id: number };

/**
 * 鉴权之后的 HTTP 入口：解析 body、建线程、处理「跳过待办」短路与主管线，返回 JSON 或 SSE。
 */
export const handleAgentChatPost = async (input: {
  body: unknown;
  signal?: AbortSignal;
  user: AgentChatPostUser;
}) => {
  const { body, signal, user } = input;

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
  const suggestionSource = parseSuggestionSource(body);
  const requestedTurnId =
    typeof body.turnId === "string" &&
    /^[A-Za-z0-9:_-]{8,128}$/.test(body.turnId)
      ? body.turnId
      : null;
  const turnId =
    requestedTurnId ??
    globalThis.crypto?.randomUUID?.() ??
    `agent-turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

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
  const eventStore = createPayloadAgentThreadEventStore(
    payload as never,
  );
  await ensureLegacyThreadEvents({
    store: eventStore,
    thread,
    userId: user.id,
  });
  const canonicalThread = await hydrateAgentThreadState({
    store: eventStore,
    threadId: thread.id,
  });
  const storedHistory = canonicalThread.messages;
  const clientHistory = removeCurrentMessageFromHistory(history, message);
  const resolvedHistory = (storedHistory.length > 0 ? storedHistory : clientHistory).slice(-12);
  const pendingAction =
    canonicalThread.pendingAction ??
    getThreadPendingAction(thread) ??
    parsePendingAction(body.pendingAction);
  const storedConversationState = (thread as { conversationState?: unknown }).conversationState ?? null;
  const conversationState =
    storedConversationState &&
    typeof storedConversationState === "object" &&
    "schemaVersion" in storedConversationState
      ? storedConversationState
      : resolveConversationState(storedConversationState, resolvedHistory);
  const baseTokenUsage = createTokenUsageSnapshot({
    contextTokens: estimateMessagesTokenCount(resolvedHistory) + estimateTokenCount(pendingAction),
    inputTokens: estimateTokenCount(message),
  });
  const claim = await claimAgentTurn({
    message,
    store: eventStore,
    suggestionSource,
    threadId: thread.id,
    turnId,
    userId: user.id,
    workbenchMode,
  });

  if (claim.status === "replay") {
    return createAgentChatResponse(claim.response, shouldStream);
  }

  if (claim.status === "blocked") {
    return createAgentChatResponse(
      {
        assistantMessage:
          "这个回合仍在处理中，我不会启动第二次执行。请稍后重新载入该会话。",
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        pendingAction,
        threadId: thread.id,
        tokenUsage: baseTokenUsage,
        turnId,
        workbenchMode: workbenchMode ?? undefined,
      },
      shouldStream,
    );
  }

  const intentModelEngine = await getAgentIntentModelEngine();
  const userPreferences = await getUserPreferences(user.id);
  const finalizeTurn = createAgentTurnFinalizer({
    conversationStateBefore: conversationState as never,
    eventStore,
    message,
    pendingBefore: pendingAction,
    project: (projection) =>
      payload.update({
        collection: "agent-threads",
        data: projection,
        id: thread.id,
        overrideAccess: true,
      }),
    resolvedHistory,
    runLearningLoop: runAgentLearningLoop,
    suggestionSource,
    thread,
    turnId,
    user,
    workbenchMode,
  });
  const perfTimer = isPerfTraceEnabled()
    ? createPerformanceTimer(turnId)
    : null;
  const modelCallRecorder = createModelCallBudgetRecorder();
  const pipelineDeps = {
    baseTokenUsage,
    contextPreferences,
    conversationState: conversationState as never,
    finalizeTurn,
    generateIntentWithAgentModel,
    intentModelEngine,
    message,
    modelCallRecorder,
    payload: payload as unknown as Payload,
    pendingAction,
    perfTimer,
    resolvedHistory,
    signal,
    structuredConfirmation,
    thread,
    turnId,
    user,
    userPreferences,
    workbenchMode,
  };
  const runtimeConfig = getAgentGraphRuntimeConfig();
  const selectedRunner = createAgentRuntimeRunner({
    config: runtimeConfig,
    createLangGraphRunner: () =>
      createRunProductionLangGraphAgentChatPipeline(pipelineDeps),
    createLegacyRunner: () => createRunAgentChatPipeline(pipelineDeps),
  });
  const runPipeline: typeof selectedRunner = async (...args) => {
    try {
      const result = await selectedRunner(...args);
      if (perfTimer) {
        const perfTrace = perfTimer.snapshotForSSE({
          phases: {},
          threadId: thread.id,
          userId: user.id,
          streamingEnabled: shouldStream,
          coordinatorEnabled: isSessionCoordinatorEnabled(),
        });
        return { ...result, perfTrace } as typeof result;
      }
      return result;
    } catch (error) {
      if (
        isQueryStreamFailure(error) ||
        isConversationalAnswerStreamFailure(error)
      ) {
        const finalized = await finalizeTurn({
          existingMemories: [],
          failure: error,
          projectFailureAssistantMessage: false,
          pushTrace: () => undefined,
          response: {
            assistantMessage: error.safeAssistantMessage,
            confidence: 0,
            engine: "workflow",
            intent: "clarify",
            pendingAction: null,
            threadId: thread.id,
            tokenUsage: baseTokenUsage,
            turnId,
            workbenchMode: workbenchMode ?? undefined,
          },
          tokenUsage: baseTokenUsage,
        });
        if (shouldStream) throw error;
        return finalized;
      }
      if (perfTimer) {
        const perfTrace = perfTimer.snapshotForSSE({
          phases: {},
          threadId: thread.id,
          userId: user.id,
          streamingEnabled: shouldStream,
          coordinatorEnabled: isSessionCoordinatorEnabled(),
        });
        logAgentEvent("error", "chat.runtime_failure", {
          error: error instanceof Error ? error.message : String(error),
          threadId: thread.id,
          userId: user.id,
          perfRequestId: perfTrace.requestId,
          perfTotalMs: perfTrace.totalMs,
        });
      } else {
        logAgentEvent("error", "chat.runtime_failure", {
          error: error instanceof Error ? error.message : String(error),
          threadId: thread.id,
          userId: user.id,
        });
      }

      const response =
        runtimeConfig.mode === "legacy"
          ? {
              assistantMessage:
                "处理请求时遇到问题，你的会话状态已保留，请稍后重试。",
              confidence: 0,
              engine: "workflow" as const,
              intent: "clarify" as const,
              pendingAction,
              threadId: thread.id,
              tokenUsage: baseTokenUsage,
              turnId,
              workbenchMode: workbenchMode ?? undefined,
            }
          : buildLangGraphFailureResponse({
              baseTokenUsage,
              error,
              pendingAction,
              threadId: thread.id,
              workbenchMode,
            });

      return finalizeTurn({
        existingMemories: [],
        failure: error,
        pushTrace: () => undefined,
        response,
        tokenUsage: baseTokenUsage,
      });
    } finally {
      logAgentEvent("info", "chat.model_call_budget", {
        ...projectModelCallBudget(modelCallRecorder.snapshot()),
      });
    }
  };

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
