"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { initialMessages } from "@/components/dashboard/agent-chat/constants";
import type { AgentInspectorTab, ContextPreferences } from "@/components/dashboard/agent";
import { shouldCancelPendingActionKey } from "@/components/dashboard/agent/composer-keyboard";
import {
  notifyAgentTerminalDomainRefresh,
  notifyRollbackDomainRefresh,
} from "@/components/dashboard/linked-objects";
import {
  formatRollbackResultStatus,
  normalizeRollbackExecutionResult,
  type AgentRollbackExecutionResult,
} from "@/components/dashboard/agent/rollback-display";
import { readAgentChatStream } from "@/lib/agent/read-agent-chat-stream";
import { parsePublicAgentChatResponse } from "@/lib/agent/public-chat-response";
import {
  appendBackendTraceEventToActivitySteps,
  attachActivityStepsToLastAssistantMessage,
  buildAgentActivitySteps,
} from "@/lib/agent/activity";
import {
  attachPlanningChecklistDraftToLastAssistantMessage,
  attachPlanningDraftToLastAssistantMessage,
} from "@/lib/agent/planning/draft-message";
import { attachSchedulingDraftToLastAssistantMessage } from "@/lib/agent/schedule/draft-message";
import type {
  AgentChatMessage,
  AgentMessageDeliveryState,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type { AgentTurnTrace } from "@/lib/agent/trace/agent-turn-trace";
import type { AgentTraceEventPayload } from "@/lib/agent/trace";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
  AgentStreamTerminalEvent,
} from "@/lib/agent/stream-events";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
  estimateTokenCount,
} from "@/lib/agent/token-usage";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

type UseAgentChatMessagingOptions = {
  activeSuggestionSource: null | {
    suggestedPrompt: string;
    suggestionId: number;
  };
  contextPreferences: ContextPreferences;
  isSubmitting: boolean;
  loadThread: (nextThreadId?: number, options?: { preserveInspector?: boolean }) => Promise<void>;
  messages: AgentChatMessage[];
  pendingAction: PendingAction | null;
  setActiveInspectorTab: (tab: AgentInspectorTab) => void;
  setArtifactsRollbackBusy: (busy: boolean) => void;
  setArtifactsRollbackError: (error: string | null) => void;
  setErrorMessage: (message: string | null) => void;
  setInput: (value: string) => void;
  setIsSubmitting: (value: boolean) => void;
  setLastRollbackSourceRunId: (sourceRunId: number | null) => void;
  setLastRollbackResult: (result: AgentRollbackExecutionResult | null) => void;
  setMessages: Dispatch<SetStateAction<AgentChatMessage[]>>;
  setPendingAction: (action: PendingAction | null) => void;
  setActiveSuggestionSource: (
    source: null | {
      suggestedPrompt: string;
      suggestionId: number;
    },
  ) => void;
  setStatusText: (text: string) => void;
  setStreamingState: (state: "idle" | "responding" | "thinking") => void;
  setStreamChanges: Dispatch<SetStateAction<AgentStreamChangeEvent[]>>;
  setStreamProgress: Dispatch<SetStateAction<AgentStreamProgressEvent[]>>;
  setStreamStages: Dispatch<SetStateAction<AgentStreamStageEvent[]>>;
  setThinkingContent: Dispatch<SetStateAction<string>>;
  setThreadId: (id: number | null) => void;
  setTokenUsage: Dispatch<SetStateAction<AgentTokenUsage>>;
  setTraceSteps: Dispatch<SetStateAction<AgentTraceStep[]>>;
  setTurnAudit: Dispatch<SetStateAction<AgentTurnTrace | null>>;
  threadId: number | null;
  lastRollbackSourceRunId: number | null;
  workbenchMode: AgentWorkbenchMode;
};

export function useAgentChatMessaging({
  activeSuggestionSource,
  contextPreferences,
  isSubmitting,
  lastRollbackSourceRunId,
  loadThread,
  messages,
  pendingAction,
  setActiveInspectorTab,
  setArtifactsRollbackBusy,
  setArtifactsRollbackError,
  setErrorMessage,
  setInput,
  setIsSubmitting,
  setLastRollbackSourceRunId,
  setLastRollbackResult,
  setMessages,
  setPendingAction,
  setActiveSuggestionSource,
  setStatusText,
  setStreamingState,
  setStreamChanges,
  setStreamProgress,
  setStreamStages,
  setThinkingContent,
  setThreadId,
  setTokenUsage,
  setTraceSteps,
  setTurnAudit,
  threadId,
  workbenchMode,
}: UseAgentChatMessagingOptions) {
  const abortRef = useRef<AbortController | null>(null);

  const upsertTraceStep = useCallback((nextStep: AgentTraceStep) => {
    setTraceSteps((current) => {
      const index = current.findIndex((step) => step.id === nextStep.id);

      if (index === -1) {
        return [...current, nextStep];
      }

      const nextSteps = [...current];
      nextSteps[index] = {
        ...nextSteps[index],
        ...nextStep,
      };

      return nextSteps;
    });
  }, [setTraceSteps]);

  const upsertStreamStage = useCallback((nextStage: AgentStreamStageEvent) => {
    setStreamStages((current) => {
      const index = current.findIndex((stage) => stage.id === nextStage.id);

      if (index === -1) {
        return [...current, nextStage];
      }

      const nextStages = [...current];
      nextStages[index] = {
        ...nextStages[index],
        ...nextStage,
      };

      return nextStages;
    });
  }, [setStreamStages]);

  const appendStreamingAssistantContent = useCallback(
    (content: string) => {
      setMessages((current) => {
        const nextMessages = [...current];
        const lastMessage = nextMessages[nextMessages.length - 1];

        if (lastMessage?.role !== "assistant") {
          return current;
        }

        nextMessages[nextMessages.length - 1] = {
          ...lastMessage,
          content: `${lastMessage.content}${content}`,
        };

        return nextMessages;
      });
    },
    [setMessages],
  );

  const replaceStreamingAssistantContent = useCallback(
    (content: string) => {
      setMessages((current) => {
        const nextMessages = [...current];
        const lastMessage = nextMessages[nextMessages.length - 1];

        if (lastMessage?.role !== "assistant") {
          return current;
        }

        if (lastMessage.content) {
          return current;
        }

        nextMessages[nextMessages.length - 1] = {
          ...lastMessage,
          content,
        };

        return nextMessages;
      });
    },
    [setMessages],
  );

  const markStreamingAssistantDelivery = useCallback(
    (deliveryState: AgentMessageDeliveryState) => {
      setMessages((current) => {
        const nextMessages = [...current];
        const lastMessage = nextMessages.at(-1);

        if (lastMessage?.role !== "assistant") {
          return current;
        }

        nextMessages[nextMessages.length - 1] = {
          ...lastMessage,
          deliveryState,
        };
        return nextMessages;
      });
    },
    [setMessages],
  );

  const appendRealtimeBackendTraceEvent = useCallback(
    (event: AgentTraceEventPayload) => {
      setMessages((current) => {
        for (let index = current.length - 1; index >= 0; index -= 1) {
          const message = current[index];

          if (message.role !== "assistant") {
            continue;
          }

          const nextMessages = [...current];
          nextMessages[index] = {
            ...message,
            activitySteps: appendBackendTraceEventToActivitySteps(
              message.activitySteps ?? [],
              event,
            ),
          };

          return nextMessages;
        }

        return current;
      });

      if (event.status === "started") {
        setStatusText(event.title);
      }
    },
    [setMessages, setStatusText],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = useCallback(
    async (
      message: string,
      options?: {
        confirmation?: {
          actionId: string;
          capability?: string;
          type: "cancel" | "confirm";
        };
        retryFailedTurn?: boolean;
      },
    ) => {
      const nextMessage = message.trim();

      if (!nextMessage || isSubmitting) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const stableMessages = messages.filter((item) => !item.deliveryState);
      const lastStableUserIndex = options?.retryFailedTurn
        ? stableMessages.findLastIndex((item) => item.role === "user")
        : -1;
      const baseHistory = lastStableUserIndex >= 0
        ? stableMessages.slice(0, lastStableUserIndex)
        : stableMessages;
      const nextHistory = [...baseHistory, { content: nextMessage, role: "user" as const }];

      setIsSubmitting(true);
      setInput("");
      setErrorMessage(null);
      setArtifactsRollbackError(null);
      setLastRollbackResult(null);
      setMessages(nextHistory);
      setStatusText("Sunny 正在处理...");
      setStreamingState("thinking");
      setTraceSteps([]);
      setTurnAudit(null);
      setStreamStages([]);
      setStreamProgress([]);
      setStreamChanges([]);
      setThinkingContent("");
      setActiveInspectorTab("context");
      setTokenUsage(
        createTokenUsageSnapshot({
          contextTokens: estimateMessagesTokenCount(messages),
          inputTokens: estimateTokenCount(nextMessage),
        }),
      );

      let responseTokenEmitted = false;
      let streamingResponseStarted = false;

      try {
        const hasPreferences = contextPreferences.pinned.length > 0 || contextPreferences.excluded.length > 0;
        const turnId = globalThis.crypto.randomUUID();
        const suggestionSource =
          activeSuggestionSource && nextMessage === activeSuggestionSource.suggestedPrompt
            ? activeSuggestionSource
            : null;
        const response = await fetch("/api/agent/chat", {
          body: JSON.stringify({
            confirmation: options?.confirmation,
            ...(hasPreferences ? { contextPreferences } : {}),
            message: nextMessage,
            messages: nextHistory,
            pendingAction,
            ...(suggestionSource
              ? {
                  suggestedPrompt: suggestionSource.suggestedPrompt,
                  suggestionId: suggestionSource.suggestionId,
                }
              : {}),
            workbenchMode,
            stream: true,
            threadId,
            turnId,
          }),
          headers: {
            "Content-Type": "application/json",
          },
          method: "POST",
          signal: controller.signal,
        });
        const isStreamingResponse = response.headers.get("Content-Type")?.includes("text/event-stream");
        const streamFailureMessages: string[] = [];
        const streamTerminals: AgentStreamTerminalEvent[] = [];
        const data = isStreamingResponse
          ? await readAgentChatStream(response, {
              appendAssistantToken: (content) => {
                responseTokenEmitted = true;
                appendStreamingAssistantContent(content);
              },
              onBackendTraceEvent: appendRealtimeBackendTraceEvent,
              onChange: (event) => setStreamChanges((current) => [...current.slice(-11), event]),
              onDone: () => {},
              onErrorMessage: (message) => {
                streamFailureMessages.push(message);
              },
              onMeta: (data) => {
                const meta = data as Record<string, unknown> | null | undefined;
                if (meta && typeof meta.contextSummary === "string") {
                  setStatusText(meta.contextSummary);
                }
              },
              onProgress: (event) => setStreamProgress((current) => [...current.slice(-15), event]),
              onStage: (event) => {
                upsertStreamStage(event);
                if (event.status === "running") {
                  setStatusText(event.title);
                }
              },
              onTerminal: (event) => {
                streamTerminals.push(event);
              },
              onStatus: setStatusText,
              onStreamStart: () => {
                streamingResponseStarted = true;
                setMessages([
                  ...nextHistory,
                  {
                    content: "",
                    role: "assistant",
                  },
                ]);
              },
              onThinkingToken: (content) => setThinkingContent((prev) => prev + content),
              onTokenUsage: setTokenUsage,
              onTraceStep: upsertTraceStep,
              replaceAssistantContent: replaceStreamingAssistantContent,
              setStreamingState,
            })
          : parsePublicAgentChatResponse(await response.json());
        const streamTerminal = streamTerminals.at(-1) ?? null;
        const streamFailureMessage = streamFailureMessages.at(-1) ?? null;

        if (
          isStreamingResponse
          && streamTerminal
          && streamTerminal.status !== "complete"
        ) {
          const deliveryState: AgentMessageDeliveryState = streamTerminal.status;
          const statusLabel = streamTerminal.status === "partial"
            ? "回复中断"
            : streamTerminal.status === "cancelled"
              ? "已停止生成"
              : "暂时未能生成回复";

          markStreamingAssistantDelivery(deliveryState);
          setStreamStages((current) => current.map((stage) =>
            stage.status === "running"
              ? {
                  ...stage,
                  completedAt: new Date().toISOString(),
                  status: "error" as const,
                  title: statusLabel,
                }
              : stage));
          setStatusText(statusLabel);
          setStreamingState("idle");
          setTraceSteps((current) => [
            ...current,
            {
              detail: streamFailureMessage ?? statusLabel,
              id: `trace-stream-terminal-${Date.now()}`,
              kind: "error",
              status: "error",
              title: statusLabel,
            },
          ]);
          return;
        }
        const responseData = data ?? {};
        const assistantMessage =
          typeof responseData.assistantMessage === "string" ? responseData.assistantMessage : null;
        const planningChecklistDraft = responseData.planningChecklistDraft ?? null;
        const planningDraft = responseData.planningDraft ?? null;
        const schedulingDraft = responseData.schedulingDraft ?? null;
        const activitySteps = responseData.activitySteps ?? buildAgentActivitySteps({
          assistantMessage,
          backendTraceEvents: responseData.backendTraceEvents ?? [],
          intent: responseData.intent ?? null,
          lastRollbackSourceRunId: responseData.lastRollbackSourceRunId ?? null,
          pendingAction: responseData.pendingAction ?? null,
          planningChecklistDraft,
          planningDraft,
          schedulingDraft,
          traceSteps: responseData.trace ?? [],
        });

        notifyAgentTerminalDomainRefresh({
          affectedDocuments: responseData.affectedDocuments,
          assistantMessage,
          pendingAction: responseData.pendingAction,
          responseOk: response.ok,
        });

        if (!response.ok || !assistantMessage) {
          throw new Error(assistantMessage || "Agent 暂时没有返回可用结果。");
        }

        if (!isStreamingResponse) {
          setMessages((current) => [
            ...current,
            {
              content: assistantMessage,
              ...(planningChecklistDraft ? { planningChecklistDraft } : {}),
              ...(planningDraft ? { planningDraft } : {}),
              ...(schedulingDraft ? { schedulingDraft } : {}),
              ...(activitySteps.length > 0 ? { activitySteps } : {}),
              role: "assistant",
            },
          ]);
        } else if (planningChecklistDraft) {
          setMessages((current) =>
            attachPlanningChecklistDraftToLastAssistantMessage(
              current,
              planningChecklistDraft,
              responseData.pendingAction ?? null,
            ),
          );
        } else if (planningDraft) {
          setMessages((current) =>
            attachPlanningDraftToLastAssistantMessage(
              current,
              planningDraft,
              responseData.pendingAction ?? null,
            ),
          );
        } else if (schedulingDraft) {
          setMessages((current) =>
            attachSchedulingDraftToLastAssistantMessage(
              current,
              schedulingDraft,
              responseData.pendingAction ?? null,
            ),
          );
        }
        if (isStreamingResponse && activitySteps.length > 0) {
          setMessages((current) => attachActivityStepsToLastAssistantMessage(current, activitySteps));
        }

        setPendingAction(responseData.pendingAction ?? null);
        setLastRollbackSourceRunId(responseData.lastRollbackSourceRunId ?? null);
        setTraceSteps(responseData.trace ?? []);
        setTurnAudit(responseData.turnAudit ?? null);
        setThreadId(typeof responseData.threadId === "number" ? responseData.threadId : threadId);
        if (responseData.pendingAction) {
          setActiveInspectorTab("approval");
        } else if (pendingAction?.type === "await_confirmation") {
          // Confirmation was just executed — switch to linked tab
          // so the user can see the created item immediately.
          setActiveInspectorTab("linked");
        }
        if (responseData.tokenUsage) {
          setTokenUsage(responseData.tokenUsage);
        }
        setStatusText("已完成");
        if (suggestionSource) {
          setActiveSuggestionSource(null);
        }
        setStreamingState("idle");
        const targetThreadId = typeof responseData.threadId === "number" ? responseData.threadId : undefined;
        /* Await loadThread so that isSubmitting guards the next sendMessage
         * until the message list is refreshed. Prevents a race where a second
         * message is sent with stale history before the first reply is loaded. */
        try {
          await loadThread(targetThreadId, {
            preserveInspector: true,
          });
        } catch {
          // loadThread failure is non-fatal — messages are already displayed
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          markStreamingAssistantDelivery("cancelled");
          setStatusText("已停止生成");
          setStreamingState("idle");
          return;
        }

        const messageText = error instanceof Error ? error.message : "Agent 请求失败。";

        if (streamingResponseStarted) {
          const deliveryState: AgentMessageDeliveryState = responseTokenEmitted
            ? "partial"
            : "unavailable";
          markStreamingAssistantDelivery(deliveryState);
          setStatusText(deliveryState === "partial" ? "回复中断" : "暂时未能生成回复");
          setStreamingState("idle");
          setTraceSteps((current) => [
            ...current,
            {
              detail: messageText,
              id: `trace-stream-error-${Date.now()}`,
              kind: "error",
              status: "error",
              title: deliveryState === "partial" ? "回复中断" : "暂时未能生成回复",
            },
          ]);
          return;
        }

        setErrorMessage(messageText);
        setStatusText("请求失败");
        setStreamingState("idle");
        setTraceSteps((current) => [
          ...current,
          {
            detail: messageText,
            id: `trace-error-${Date.now()}`,
            kind: "error",
            status: "error",
            title: "这轮请求失败了",
          },
        ]);
      } finally {
        abortRef.current = null;
        setIsSubmitting(false);
      }
    },
    [
      activeSuggestionSource,
      appendStreamingAssistantContent,
      appendRealtimeBackendTraceEvent,
      contextPreferences,
      isSubmitting,
      loadThread,
      markStreamingAssistantDelivery,
      messages,
      pendingAction,
      replaceStreamingAssistantContent,
      setActiveInspectorTab,
      setArtifactsRollbackError,
      setErrorMessage,
      setInput,
      setIsSubmitting,
      setLastRollbackSourceRunId,
      setLastRollbackResult,
      setMessages,
      setPendingAction,
      setActiveSuggestionSource,
      setStatusText,
      setStreamingState,
      setStreamChanges,
      setStreamProgress,
      setStreamStages,
      setThinkingContent,
      setThreadId,
      setTokenUsage,
      setTraceSteps,
      setTurnAudit,
      threadId,
      workbenchMode,
      upsertTraceStep,
      upsertStreamStage,
    ],
  );

  useEffect(() => {
    if (pendingAction?.type !== "await_confirmation") {
      return;
    }

    const action = pendingAction.action;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const targetIsEditable =
        target instanceof HTMLElement &&
        (
          target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT"
        );

      if (!shouldCancelPendingActionKey(event, targetIsEditable)) {
        return;
      }

      event.preventDefault();
      void sendMessage("取消", {
        confirmation: {
          actionId: action.id,
          ...(action.capability ? { capability: action.capability } : {}),
          type: "cancel",
        },
      });
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [pendingAction, sendMessage]);

  const resetThread = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setThreadId(null);
    setPendingAction(null);
    setMessages(initialMessages);
    setStatusText("等待输入");
    setIsSubmitting(false);
    setStreamingState("idle");
    setTraceSteps([]);
    setTurnAudit(null);
    setStreamStages([]);
    setStreamProgress([]);
    setStreamChanges([]);
    setLastRollbackSourceRunId(null);
    setLastRollbackResult(null);
    setArtifactsRollbackError(null);
    setInput("");
    setErrorMessage(null);
    setActiveInspectorTab("context");
    setTokenUsage(
      createTokenUsageSnapshot({
        contextTokens: estimateMessagesTokenCount(initialMessages),
      }),
    );
  }, [
    setActiveInspectorTab,
    setArtifactsRollbackError,
    setErrorMessage,
    setInput,
    setIsSubmitting,
    setLastRollbackSourceRunId,
    setLastRollbackResult,
    setMessages,
    setPendingAction,
    setStatusText,
    setStreamingState,
    setStreamChanges,
    setStreamProgress,
    setStreamStages,
    setThreadId,
    setTokenUsage,
    setTraceSteps,
    setTurnAudit,
  ]);

  const confirmApproval = useCallback(() => {
    const action = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;

    if (action) {
      void sendMessage("确认", {
        confirmation: {
          actionId: action.id,
          ...(action.capability ? { capability: action.capability } : {}),
          type: "confirm",
        },
      });

      return;
    }

    void sendMessage("确认");
  }, [pendingAction, sendMessage]);

  const cancelApproval = useCallback(() => {
    const action = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;

    if (action) {
      void sendMessage("取消", {
        confirmation: {
          actionId: action.id,
          ...(action.capability ? { capability: action.capability } : {}),
          type: "cancel",
        },
      });

      return;
    }

    void sendMessage("取消");
  }, [pendingAction, sendMessage]);

  const retryLastMessage = useCallback(() => {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");

    if (!lastUserMessage) {
      return;
    }

    void sendMessage(lastUserMessage.content, { retryFailedTurn: true });
  }, [messages, sendMessage]);

  const editApproval = useCallback(
    (kind: "generic" | "plan" | "schedule") => {
      const prompt =
        kind === "schedule"
          ? "我想调整这个日程提案："
          : kind === "plan"
            ? "我想调整这个计划提案："
            : "我想调整这个待确认动作：";

      setInput(prompt);
      setStatusText("可以先取消当前提案，再描述你要调整的地方");
    },
    [setInput, setStatusText],
  );

  const runArtifactsRollback = useCallback(async () => {
    if (!lastRollbackSourceRunId) {
      return;
    }

    setArtifactsRollbackBusy(true);
    setArtifactsRollbackError(null);

    try {
      const res = await fetch("/api/agent/rollback", {
        body: JSON.stringify({ sourceRunId: lastRollbackSourceRunId }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await res.json()) as { message?: string; result?: unknown };
      const rollbackResult = normalizeRollbackExecutionResult(data.result);

      notifyRollbackDomainRefresh({
        responseOk: res.ok,
        result: rollbackResult,
      });

      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "回滚失败");
      }

      setLastRollbackSourceRunId(null);
      await loadThread(threadId ?? undefined, { preserveInspector: true });
      setLastRollbackResult(rollbackResult);
      setActiveInspectorTab("trace");
      setStatusText(
        rollbackResult
          ? `${formatRollbackResultStatus(rollbackResult)}${rollbackResult.auditWarning ? `；审计提示：${rollbackResult.auditWarning}` : ""}`
          : "已执行撤销",
      );
    } catch (error) {
      setArtifactsRollbackError(error instanceof Error ? error.message : "回滚失败");
    } finally {
      setArtifactsRollbackBusy(false);
    }
  }, [
    lastRollbackSourceRunId,
    loadThread,
    setActiveInspectorTab,
    setArtifactsRollbackBusy,
    setArtifactsRollbackError,
    setLastRollbackSourceRunId,
    setLastRollbackResult,
    setStatusText,
    threadId,
  ]);

  return {
    cancelApproval,
    confirmApproval,
    editApproval,
    resetThread,
    retryLastMessage,
    runArtifactsRollback,
    sendMessage,
    stopGeneration,
  };
}
