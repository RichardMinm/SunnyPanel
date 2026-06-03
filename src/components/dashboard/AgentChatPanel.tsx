"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AgentWorkbench,
  type AgentInspectorTab,
  type ContextPreferences,
} from "@/components/dashboard/agent";
import { initialMessages, thinkingStatusKeywords } from "@/components/dashboard/agent-chat/constants";
import {
  formatRollbackResultStatus,
  normalizeRollbackExecutionResult,
  type AgentRollbackExecutionResult,
} from "@/components/dashboard/agent/rollback-display";
import { useAgentChatMessaging } from "@/components/dashboard/agent-chat/use-agent-chat-messaging";
import { useDashboardUrlThreadSync } from "@/components/dashboard/agent-chat/use-dashboard-url-thread-sync";
import { useAgentThreadList } from "@/components/dashboard/agent-chat/use-agent-thread";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { canRollbackAgentRunDetail } from "@/lib/agent/run-summary";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
} from "@/lib/agent/token-usage";

export type AgentChatPanelProps = {
  initialThreadId?: number;
  quickPrompts?: AgentQuickPrompt[];
  suggestions?: AgentInboxSuggestion[];
};

export function AgentChatPanel({
  initialThreadId,
  quickPrompts = [],
  suggestions = [],
}: AgentChatPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const [messages, setMessages] = useState<AgentChatMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<null | PendingAction>(null);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    archiveThread: archiveThreadRequest,
    clearRunDetail,
    fetchThread,
    fetchRunDetail,
    runDetailError,
    selectedRunDetail,
    setThreadId,
    threadId,
  } = useAgentThreadList();
  const [inboxSuggestions, setInboxSuggestions] = useState<AgentInboxSuggestion[]>(suggestions);
  const [statusText, setStatusText] = useState("已就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<"idle" | "responding" | "thinking">("idle");
  const [traceSteps, setTraceSteps] = useState<AgentTraceStep[]>([]);
  const [activeInspectorTab, setActiveInspectorTab] = useState<AgentInspectorTab>("context");
  const [tokenUsage, setTokenUsage] = useState<AgentTokenUsage>(() =>
    createTokenUsageSnapshot({
      contextTokens: estimateMessagesTokenCount(initialMessages),
    }),
  );
  const [lastRollbackPayload, setLastRollbackPayload] = useState<unknown | null>(null);
  const [lastRollbackResult, setLastRollbackResult] = useState<AgentRollbackExecutionResult | null>(null);
  const [artifactsRollbackBusy, setArtifactsRollbackBusy] = useState(false);
  const [artifactsRollbackError, setArtifactsRollbackError] = useState<string | null>(null);
  const [selectedRunRollbackBusy, setSelectedRunRollbackBusy] = useState(false);
  const [selectedRunRollbackError, setSelectedRunRollbackError] = useState<string | null>(null);
  const [contextPreferences, setContextPreferences] = useState<ContextPreferences>({ excluded: [], pinned: [] });
  const [thinkingContent, setThinkingContent] = useState("");
  const [threadHydrated, setThreadHydrated] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const loadThread = useCallback(
    async (nextThreadId?: number, options?: { preserveInspector?: boolean }) => {
      const selectedThread = await fetchThread(nextThreadId);

      if (!selectedThread) {
        if (typeof nextThreadId === "number") {
          setErrorMessage("无法加载会话，请稍后重试。");
          setStatusText("加载失败");
          setThreadHydrated(true);
          return;
        }

        setErrorMessage(null);
        setPendingAction(null);
        setMessages(initialMessages);
        setTokenUsage(
          createTokenUsageSnapshot({
            contextTokens: estimateMessagesTokenCount(initialMessages),
          }),
        );
        setTraceSteps([]);
        setLastRollbackPayload(null);
        setLastRollbackResult(null);
        setArtifactsRollbackError(null);
        setSelectedRunRollbackError(null);
        if (!options?.preserveInspector) {
          setActiveInspectorTab("context");
        }
        setStatusText("已就绪");
        setThreadHydrated(true);
        return;
      }

      setErrorMessage(null);
      setPendingAction(selectedThread.pendingAction);
      setMessages(selectedThread.messages.length > 0 ? selectedThread.messages : initialMessages);
      setTokenUsage(
        createTokenUsageSnapshot({
          contextTokens: estimateMessagesTokenCount(selectedThread.messages),
        }),
      );
      setTraceSteps([]);
      setLastRollbackPayload(null);
      setLastRollbackResult(null);
      setArtifactsRollbackError(null);
      setSelectedRunRollbackError(null);
      if (!options?.preserveInspector) {
        setActiveInspectorTab(
          selectedThread.pendingAction?.type === "await_confirmation" ||
            selectedThread.pendingAction?.type === "await_batch_confirmation"
            ? "approval"
            : "context",
        );
      }
      setStatusText(`已恢复 Thread #${selectedThread.id}`);
      setThreadHydrated(true);
    },
    [fetchThread],
  );

  const {
    cancelApproval,
    confirmApproval,
    editApproval,
    resetThread,
    runArtifactsRollback,
    sendMessage,
    stopGeneration,
  } = useAgentChatMessaging({
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
    setInboxSuggestions,
    setInput,
    setIsSubmitting,
    setLastRollbackPayload,
    setLastRollbackResult,
    setMessages,
    setPendingAction,
    setStatusText,
    setStreamingState,
    setThinkingContent,
    setThreadId,
    setTokenUsage,
    setTraceSteps,
    threadId,
  });

  useDashboardUrlThreadSync(threadId, threadHydrated);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setInboxSuggestions(suggestions);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [suggestions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadThread(initialThreadId);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [initialThreadId, loadThread]);

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (!transcript) {
      return;
    }

    const nextFrame = window.requestAnimationFrame(() => {
      transcript.scrollTo({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        top: transcript.scrollHeight,
      });
    });

    return () => window.cancelAnimationFrame(nextFrame);
  }, [messages, shouldReduceMotion, statusText, isSubmitting]);

  const inputTokenEstimate = useMemo(() => estimateMessagesTokenCount([{ content: input, role: "user" }]), [input]);
  const isThinking = isSubmitting && streamingState !== "responding";
  const statusLabel = useMemo(() => {
    if (!isSubmitting) {
      return statusText;
    }

    if (thinkingStatusKeywords.some((keyword) => statusText.includes(keyword))) {
      return statusText;
    }

    return streamingState === "responding" ? "Agent 正在组织回复..." : "Agent 正在理解上下文...";
  }, [isSubmitting, statusText, streamingState]);

  const toggleContextPin = useCallback((key: string) => {
    setContextPreferences((prev) => {
      const isPinned = prev.pinned.includes(key);

      return {
        excluded: isPinned ? prev.excluded : prev.excluded.filter((k) => k !== key),
        pinned: isPinned ? prev.pinned.filter((k) => k !== key) : [...prev.pinned, key],
      };
    });
  }, []);

  const toggleContextExclude = useCallback((key: string) => {
    setContextPreferences((prev) => {
      const isExcluded = prev.excluded.includes(key);

      return {
        excluded: isExcluded ? prev.excluded.filter((k) => k !== key) : [...prev.excluded, key],
        pinned: isExcluded ? prev.pinned : prev.pinned.filter((k) => k !== key),
      };
    });
  }, []);

  const archiveThread = useCallback(
    async (archiveThreadId: number, archived: boolean) => {
      const ok = await archiveThreadRequest(archiveThreadId, archived);

      if (!ok) {
        setErrorMessage("归档操作失败");
      }
    },
    [archiveThreadRequest],
  );

  const selectRunDetail = useCallback(
    async (runId: number) => {
      const run = await fetchRunDetail(runId);

      if (!run) {
        setErrorMessage(runDetailError ?? "无法读取执行记录。");
        return;
      }

      setErrorMessage(null);
      setSelectedRunRollbackError(null);
      setActiveInspectorTab("trace");
      setStatusText(`已载入 AgentRun #${runId}`);
    },
    [fetchRunDetail, runDetailError],
  );

  const rollbackSelectedRun = useCallback(async () => {
    if (!selectedRunDetail || !canRollbackAgentRunDetail(selectedRunDetail)) {
      setSelectedRunRollbackError("这条执行记录没有可自动撤销的 rollbackPayload。");
      return;
    }

    setSelectedRunRollbackBusy(true);
    setSelectedRunRollbackError(null);

    try {
      const response = await fetch("/api/agent/rollback", {
        body: JSON.stringify({
          rollbackPayload: selectedRunDetail.rollbackPayload,
          sourceRunId: selectedRunDetail.id,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string; result?: unknown };

      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "回滚失败");
      }

      const rollbackResult = normalizeRollbackExecutionResult(data.result);

      await loadThread(threadId ?? undefined, { preserveInspector: true });
      setLastRollbackPayload(null);
      setLastRollbackResult(rollbackResult);
      setActiveInspectorTab("trace");
      setStatusText(rollbackResult ? formatRollbackResultStatus(rollbackResult) : "已执行撤销");
    } catch (error) {
      setSelectedRunRollbackError(error instanceof Error ? error.message : "回滚失败");
    } finally {
      setSelectedRunRollbackBusy(false);
    }
  }, [loadThread, selectedRunDetail, threadId]);

  const tokenCountStr = (() => {
    if (tokenUsage.totalTokens <= 0) return undefined;
    const k = Math.round(tokenUsage.totalTokens / 100) / 10;
    return `${k}k tokens`;
  })();

  return (
    <AgentWorkbench
      activeInspectorTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      errorMessage={errorMessage}
      input={input}
      inputTokenEstimate={inputTokenEstimate}
      isSubmitting={isSubmitting}
      isThinking={isThinking}
      lastRollbackPayload={lastRollbackPayload}
      lastRollbackResult={lastRollbackResult}
      messages={messages}
      onActiveInspectorTabChange={setActiveInspectorTab}
      onArtifactsRollback={() => {
        clearRunDetail();
        runArtifactsRollback();
      }}
      onCancelApproval={() => {
        clearRunDetail();
        cancelApproval();
      }}
      onEditApproval={editApproval}
      onConfirmApproval={() => {
        clearRunDetail();
        confirmApproval();
      }}
      onInputChange={setInput}
      onRollbackSelectedRun={() => {
        void rollbackSelectedRun();
      }}
      onStop={stopGeneration}
      onSubmit={() => {
        clearRunDetail();
        void sendMessage(input);
      }}
      onToggleContextExclude={toggleContextExclude}
      onToggleContextPin={toggleContextPin}
      pendingAction={pendingAction}
      selectedRunDetail={selectedRunDetail}
      selectedRunRollbackBusy={selectedRunRollbackBusy}
      selectedRunRollbackError={selectedRunRollbackError}
      statusLabel={statusLabel}
      thinkingContent={thinkingContent}
      threadId={threadId}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
      transcriptRef={transcriptRef}
    />
  );
}
