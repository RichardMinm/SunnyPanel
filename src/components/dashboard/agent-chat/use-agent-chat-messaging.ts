"use client";

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import { engineLabelMap, initialMessages } from "@/components/dashboard/agent-chat/constants";
import type { AgentInspectorTab, ContextPreferences } from "@/components/dashboard/agent";
import {
  formatRollbackResultStatus,
  normalizeRollbackExecutionResult,
  type AgentRollbackExecutionResult,
} from "@/components/dashboard/agent/rollback-display";
import { readAgentChatStream } from "@/lib/agent/read-agent-chat-stream";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
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
  setLastRollbackPayload: (payload: unknown | null) => void;
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
  threadId: number | null;
  lastRollbackPayload: unknown | null;
  workbenchMode: AgentWorkbenchMode;
};

export function useAgentChatMessaging({
  activeSuggestionSource,
  contextPreferences,
  isSubmitting,
  lastRollbackPayload,
  loadThread,
  messages,
  pendingAction,
  setActiveInspectorTab,
  setArtifactsRollbackBusy,
  setArtifactsRollbackError,
  setErrorMessage,
  setInput,
  setIsSubmitting,
  setLastRollbackPayload,
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
          type: "cancel" | "confirm";
        };
      },
    ) => {
      const nextMessage = message.trim();

      if (!nextMessage || isSubmitting) {
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const nextHistory = [...messages, { content: nextMessage, role: "user" as const }];

      setIsSubmitting(true);
      setInput("");
      setErrorMessage(null);
      setArtifactsRollbackError(null);
      setLastRollbackResult(null);
      setMessages(nextHistory);
      setStatusText("正在让 Agent 解析并执行...");
      setStreamingState("thinking");
      setTraceSteps([]);
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
        const data = isStreamingResponse
          ? await readAgentChatStream(response, {
              appendAssistantToken: appendStreamingAssistantContent,
              onChange: (event) => setStreamChanges((current) => [...current.slice(-11), event]),
              onDone: () => {},
              onErrorMessage: replaceStreamingAssistantContent,
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
              onStatus: setStatusText,
              onStreamStart: () => {
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
          : ((await response.json()) as Partial<AgentChatResponse> & {
              assistantMessage?: string;
            });
        const responseData = data ?? {};
        const assistantMessage =
          typeof responseData.assistantMessage === "string" ? responseData.assistantMessage : null;

        if (!response.ok || !assistantMessage) {
          throw new Error(assistantMessage || "Agent 暂时没有返回可用结果。");
        }

        if (!isStreamingResponse) {
          setMessages((current) => [
            ...current,
            {
              content: assistantMessage,
              role: "assistant",
            },
          ]);
        }

        setPendingAction(responseData.pendingAction ?? null);
        setLastRollbackPayload(
          "lastRollbackPayload" in responseData && responseData.lastRollbackPayload !== undefined
            ? responseData.lastRollbackPayload
            : null,
        );
        setTraceSteps(responseData.trace ?? []);
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
        setStatusText(responseData.engine ? `最近一次：${engineLabelMap[responseData.engine]}` : "已完成");
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
          setStatusText("已停止生成");
          setStreamingState("idle");
          return;
        }

        const messageText = error instanceof Error ? error.message : "Agent 请求失败。";

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
      contextPreferences,
      isSubmitting,
      loadThread,
      messages,
      pendingAction,
      replaceStreamingAssistantContent,
      setActiveInspectorTab,
      setArtifactsRollbackError,
      setErrorMessage,
      setInput,
      setIsSubmitting,
      setLastRollbackPayload,
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
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      void sendMessage("取消", {
        confirmation: {
          actionId: action.id,
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
    setStatusText("已开启新任务");
    setIsSubmitting(false);
    setStreamingState("idle");
    setTraceSteps([]);
    setStreamStages([]);
    setStreamProgress([]);
    setStreamChanges([]);
    setLastRollbackPayload(null);
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
    setLastRollbackPayload,
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
  ]);

  const confirmApproval = useCallback(() => {
    const action = pendingAction?.type === "await_confirmation" ? pendingAction.action : null;

    if (action) {
      void sendMessage("确认", {
        confirmation: {
          actionId: action.id,
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
          type: "cancel",
        },
      });

      return;
    }

    void sendMessage("取消");
  }, [pendingAction, sendMessage]);

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
    if (!lastRollbackPayload) {
      return;
    }

    setArtifactsRollbackBusy(true);
    setArtifactsRollbackError(null);

    try {
      const res = await fetch("/api/agent/rollback", {
        body: JSON.stringify({ rollbackPayload: lastRollbackPayload }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await res.json()) as { message?: string; result?: unknown };

      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "回滚失败");
      }

      const rollbackResult = normalizeRollbackExecutionResult(data.result);

      setLastRollbackPayload(null);
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
    lastRollbackPayload,
    loadThread,
    setActiveInspectorTab,
    setArtifactsRollbackBusy,
    setArtifactsRollbackError,
    setLastRollbackPayload,
    setLastRollbackResult,
    setStatusText,
    threadId,
  ]);

  return {
    cancelApproval,
    confirmApproval,
    editApproval,
    resetThread,
    runArtifactsRollback,
    sendMessage,
    stopGeneration,
  };
}
