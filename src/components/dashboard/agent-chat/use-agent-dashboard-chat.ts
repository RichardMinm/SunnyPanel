"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { AgentInspectorTab, ContextPreferences } from "@/components/dashboard/agent";
import { initialMessages } from "@/components/dashboard/agent-chat/constants";
import {
  formatRollbackResultStatus,
  normalizeRollbackExecutionResult,
  type AgentRollbackExecutionResult,
} from "@/components/dashboard/agent/rollback-display";
import { useAgentChatMessaging } from "@/components/dashboard/agent-chat/use-agent-chat-messaging";
import { useDashboardUrlThreadSync } from "@/components/dashboard/agent-chat/use-dashboard-url-thread-sync";
import { useAgentThreadList } from "@/components/dashboard/agent-chat/use-agent-thread";
import { notifyRollbackDomainRefresh } from "@/components/dashboard/linked-objects";
import { canRollbackAgentRunDetail } from "@/lib/agent/run-summary";
import { attachAgentActivityStepsToMessages } from "@/lib/agent/activity";
import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import type { AgentTurnTrace } from "@/lib/agent/trace/agent-turn-trace";
import type {
  AgentStreamChangeEvent,
  AgentStreamProgressEvent,
  AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
} from "@/lib/agent/token-usage";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

export type UseAgentDashboardChatOptions = {
  initialThreadId?: number;
};

type AgentSuggestionComposerSource = {
  suggestedPrompt: string;
  suggestionId: number;
};

export function useAgentDashboardChat({
  initialThreadId,
}: UseAgentDashboardChatOptions) {
  const shouldReduceMotion = useReducedMotion();
  const [messages, setMessages] = useState<AgentChatMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<null | PendingAction>(null);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    archiveThread,
    clearRunDetail,
    deleteThread,
    fetchThread,
    fetchRunDetail,
    lastInteractionAt,
    runDetailError,
    selectedRunDetail,
    setThreadId,
    setThreads,
    threadId,
    threads,
  } = useAgentThreadList();
  const [statusText, setStatusText] = useState("已就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<"idle" | "responding" | "thinking">("idle");
  const [traceSteps, setTraceSteps] = useState<AgentTraceStep[]>([]);
  const [turnAudit, setTurnAudit] = useState<AgentTurnTrace | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] = useState<AgentInspectorTab>("context");
  const [tokenUsage, setTokenUsage] = useState<AgentTokenUsage>(() =>
    createTokenUsageSnapshot({
      contextTokens: estimateMessagesTokenCount(initialMessages),
    }),
  );
  const [lastRollbackSourceRunId, setLastRollbackSourceRunId] = useState<number | null>(null);
  const [lastRollbackResult, setLastRollbackResult] = useState<AgentRollbackExecutionResult | null>(null);
  const [artifactsRollbackBusy, setArtifactsRollbackBusy] = useState(false);
  const [artifactsRollbackError, setArtifactsRollbackError] = useState<string | null>(null);
  const [selectedRunRollbackBusy, setSelectedRunRollbackBusy] = useState(false);
  const [selectedRunRollbackError, setSelectedRunRollbackError] = useState<string | null>(null);
  const [contextPreferences, setContextPreferences] = useState<ContextPreferences>({ excluded: [], pinned: [] });
  const [thinkingContent, setThinkingContent] = useState("");
  const [streamStages, setStreamStages] = useState<AgentStreamStageEvent[]>([]);
  const [streamProgress, setStreamProgress] = useState<AgentStreamProgressEvent[]>([]);
  const [streamChanges, setStreamChanges] = useState<AgentStreamChangeEvent[]>([]);
  const [threadTitle, setThreadTitle] = useState("");
  const [threadHydrated, setThreadHydrated] = useState(false);
  const [workbenchMode, setWorkbenchMode] = useState<AgentWorkbenchMode>("ask");
  const [activeSuggestionSource, setActiveSuggestionSource] = useState<null | AgentSuggestionComposerSource>(null);
  const [composerFocusRequestKey, setComposerFocusRequestKey] = useState(0);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const skipInitialThreadLoadRef = useRef(false);

  const setInputAndClearSuggestion = useCallback(
    (value: string) => {
      setInput(value);
      setActiveSuggestionSource((current) =>
        current && value !== current.suggestedPrompt ? null : current,
      );
    },
    [],
  );

  const prefillFromSuggestion = useCallback(
    (prompt: string, source?: AgentSuggestionComposerSource) => {
      setInput(prompt);
      setActiveSuggestionSource(source ?? null);
    },
    [],
  );

  const focusComposer = useCallback(() => {
    setComposerFocusRequestKey((current) => current + 1);
  }, []);

  const loadThread = useCallback(
    async (nextThreadId?: number, options?: { preserveInspector?: boolean; listOnly?: boolean }) => {
      const selectedThread = await fetchThread(nextThreadId, { listOnly: options?.listOnly });

      if (!selectedThread) {
        if (typeof nextThreadId === "number") {
          setErrorMessage("无法加载会话，请稍后重试。");
          setStatusText("加载失败");
          setThreadHydrated(true);
          return;
        }

        setErrorMessage(null);
        setPendingAction(null);
        setThreadTitle("");
        setMessages(attachAgentActivityStepsToMessages(initialMessages));
        setTokenUsage(
          createTokenUsageSnapshot({
            contextTokens: estimateMessagesTokenCount(initialMessages),
          }),
        );
        setTraceSteps([]);
        setTurnAudit(null);
        setStreamStages([]);
        setStreamProgress([]);
        setStreamChanges([]);
        setLastRollbackSourceRunId(null);
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
      setThreadTitle(selectedThread.title || "");
      setMessages(
        attachAgentActivityStepsToMessages(
          selectedThread.messages.length > 0 ? selectedThread.messages : initialMessages,
          selectedThread.pendingAction,
        ),
      );
      setTokenUsage(
        createTokenUsageSnapshot({
          contextTokens: estimateMessagesTokenCount(selectedThread.messages),
        }),
      );
      setTraceSteps([]);
      setTurnAudit(null);
      setStreamStages([]);
      setStreamProgress([]);
      setStreamChanges([]);
      if (!options?.preserveInspector) {
        setLastRollbackSourceRunId(null);
        setLastRollbackResult(null);
        setArtifactsRollbackError(null);
        setSelectedRunRollbackError(null);
        setActiveInspectorTab(selectedThread.pendingAction ? "approval" : "context");
      }
      setStatusText("已就绪");
      setThreadHydrated(true);
    },
    [fetchThread],
  );

  const {
    cancelApproval,
    confirmApproval,
    editApproval,
    resetThread: resetConversationThread,
    retryLastMessage,
    runArtifactsRollback,
    sendMessage,
    stopGeneration,
  } = useAgentChatMessaging({
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
  });

  useDashboardUrlThreadSync(threadId, threadHydrated);

  const resetThread = useCallback(() => {
    skipInitialThreadLoadRef.current = true;
    stopGeneration();
    resetConversationThread();
    clearRunDetail();
    setThreadTitle("");
    setThreadHydrated(true);
    focusComposer();
    void fetchThread(undefined, { listOnly: true });
  }, [clearRunDetail, fetchThread, focusComposer, resetConversationThread, stopGeneration]);

  useEffect(() => {
    if (skipInitialThreadLoadRef.current && initialThreadId === undefined) {
      skipInitialThreadLoadRef.current = false;
      return;
    }

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
  }, [messages, shouldReduceMotion, statusText, isSubmitting, streamStages.length, streamProgress.length, streamChanges.length]);

  const inputTokenEstimate = useMemo(() => estimateMessagesTokenCount([{ content: input, role: "user" }]), [input]);
  const isThinking = isSubmitting && streamingState !== "responding";
  const statusLabel = useMemo(() => {
    if (!isSubmitting) {
      return statusText;
    }

    return streamingState === "responding" ? "Sunny 正在组织回复..." : "Sunny 正在处理...";
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

  const renameThread = useCallback(async (title: string) => {
    if (!threadId) return false;

    const sanitized = title.trim().slice(0, 200);
    if (!sanitized) return false;

    try {
      const response = await fetch("/api/agent/thread", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: threadId, title: sanitized }),
      });

      if (!response.ok) return false;
    } catch {
      return false;
    }

    setThreadTitle(sanitized);
    setThreads((current) =>
      current.map((t) => (t.id === threadId ? { ...t, title: sanitized } : t)),
    );
    return true;
  }, [setThreads, threadId]);

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
      setStatusText(`已载入执行记录 #${runId}`);
    },
    [fetchRunDetail, runDetailError],
  );

  const rollbackSelectedRun = useCallback(async () => {
    if (!selectedRunDetail || !canRollbackAgentRunDetail(selectedRunDetail)) {
      setSelectedRunRollbackError("这条执行记录当前不可自动撤销。");
      return;
    }

    setSelectedRunRollbackBusy(true);
    setSelectedRunRollbackError(null);

    try {
      const response = await fetch("/api/agent/rollback", {
        body: JSON.stringify({ sourceRunId: selectedRunDetail.id }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });
      const data = (await response.json()) as { message?: string; result?: unknown };
      const rollbackResult = normalizeRollbackExecutionResult(data.result);

      notifyRollbackDomainRefresh({
        responseOk: response.ok,
        result: rollbackResult,
      });

      if (!response.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "回滚失败");
      }

      await loadThread(threadId ?? undefined, { preserveInspector: true });
      setLastRollbackSourceRunId(null);
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

  return {
    activeInspectorTab,
    archiveThread,
    artifactsRollbackBusy,
    artifactsRollbackError,
    cancelApproval,
    clearRunDetail,
    composerFocusRequestKey,
    confirmApproval,
    contextPreferences,
    deleteThread,
    editApproval,
    errorMessage,
    focusComposer,
    input,
    inputTokenEstimate,
    isSubmitting,
    isThinking,
    lastInteractionAt,
    lastRollbackSourceRunId,
    lastRollbackResult,
    loadThread,
    messages,
    pendingAction,
    renameThread,
    resetThread,
    retryLastMessage,
    rollbackSelectedRun,
    runArtifactsRollback,
    selectRunDetail,
    selectedRunDetail,
    selectedRunRollbackBusy,
    selectedRunRollbackError,
    sendMessage,
    setInput: setInputAndClearSuggestion,
    prefillFromSuggestion,
    setActiveInspectorTab,
    statusLabel,
    stopGeneration,
    streamChanges,
    streamProgress,
    streamStages,
    thinkingContent,
    threadId,
    threadTitle,
    threads,
    tokenCountStr,
    tokenUsage,
    toggleContextExclude,
    toggleContextPin,
    traceSteps,
    turnAudit,
    transcriptRef,
    workbenchMode,
    setWorkbenchMode,
  };
}

export type AgentDashboardChatController = ReturnType<typeof useAgentDashboardChat>;
