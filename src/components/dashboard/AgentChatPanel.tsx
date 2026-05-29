"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AgentWorkbench,
  type AgentInspectorTab,
  type AgentWorkbenchMode,
  type ContextPreferences,
} from "@/components/dashboard/agent";
import { initialMessages, thinkingStatusKeywords } from "@/components/dashboard/agent-chat/constants";
import { useAgentChatMessaging } from "@/components/dashboard/agent-chat/use-agent-chat-messaging";
import { useDashboardUrlThreadSync } from "@/components/dashboard/agent-chat/use-dashboard-url-thread-sync";
import { useAgentThreadList } from "@/components/dashboard/agent-chat/use-agent-thread";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
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
    fetchThread,
    recentRuns,
    searchThreads,
    setThreadId,
    threadId,
    threads,
  } = useAgentThreadList();
  const [inboxSuggestions, setInboxSuggestions] = useState<AgentInboxSuggestion[]>(suggestions);
  const [statusText, setStatusText] = useState("已就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<"idle" | "responding" | "thinking">("idle");
  const [traceSteps, setTraceSteps] = useState<AgentTraceStep[]>([]);
  const [workbenchMode, setWorkbenchMode] = useState<AgentWorkbenchMode>("timeline");
  const [activeInspectorTab, setActiveInspectorTab] = useState<AgentInspectorTab>("context");
  const [tokenUsage, setTokenUsage] = useState<AgentTokenUsage>(() =>
    createTokenUsageSnapshot({
      contextTokens: estimateMessagesTokenCount(initialMessages),
    }),
  );
  const [lastRollbackPayload, setLastRollbackPayload] = useState<unknown | null>(null);
  const [artifactsRollbackBusy, setArtifactsRollbackBusy] = useState(false);
  const [artifactsRollbackError, setArtifactsRollbackError] = useState<string | null>(null);
  const [contextPreferences, setContextPreferences] = useState<ContextPreferences>({ excluded: [], pinned: [] });
  const [suggestedMode, setSuggestedMode] = useState<AgentWorkbenchMode | null>(null);
  const [thinkingContent, setThinkingContent] = useState("");
  const [threadHydrated, setThreadHydrated] = useState(false);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  const loadThread = useCallback(
    async (nextThreadId?: number, options?: { preserveInspector?: boolean }) => {
      const selectedThread = await fetchThread(nextThreadId);

      if (!selectedThread) {
        setErrorMessage("无法加载会话，请稍后重试。");
        setStatusText("加载失败");
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
      setArtifactsRollbackError(null);
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
    runSuggestion,
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
    setMessages,
    setPendingAction,
    setStatusText,
    setStreamingState,
    setSuggestedMode,
    setThinkingContent,
    setThreadId,
    setTokenUsage,
    setTraceSteps,
    threadId,
    workbenchMode,
  });

  useDashboardUrlThreadSync(threadId, threadHydrated);

  useEffect(() => {
    setInboxSuggestions(suggestions);
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

  return (
    <AgentWorkbench
      activeInspectorTab={activeInspectorTab}
      artifactsRollbackBusy={artifactsRollbackBusy}
      artifactsRollbackError={artifactsRollbackError}
      contextPreferences={contextPreferences}
      errorMessage={errorMessage}
      inboxSuggestions={inboxSuggestions}
      input={input}
      inputTokenEstimate={inputTokenEstimate}
      isSubmitting={isSubmitting}
      isThinking={isThinking}
      lastRollbackPayload={lastRollbackPayload}
      messages={messages}
      mode={workbenchMode}
      onActiveInspectorTabChange={setActiveInspectorTab}
      onArchiveThread={archiveThread}
      onArtifactsRollback={runArtifactsRollback}
      onCancelApproval={cancelApproval}
      onEditApproval={editApproval}
      onConfirmApproval={confirmApproval}
      onInputChange={setInput}
      onLoadThread={(nextThreadId) => {
        void loadThread(nextThreadId);
      }}
      onModeChange={setWorkbenchMode}
      onNewThread={resetThread}
      onRunPrompt={(prompt) => {
        void sendMessage(prompt);
      }}
      onRunSuggestion={(suggestion) => {
        void runSuggestion(suggestion);
      }}
      onSearchThreads={searchThreads}
      onStop={stopGeneration}
      onSubmit={() => {
        void sendMessage(input);
      }}
      onToggleContextExclude={toggleContextExclude}
      onToggleContextPin={toggleContextPin}
      pendingAction={pendingAction}
      quickPrompts={quickPrompts}
      recentRuns={recentRuns}
      statusLabel={statusLabel}
      suggestedMode={suggestedMode}
      thinkingContent={thinkingContent}
      threadId={threadId}
      threads={threads}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
      transcriptRef={transcriptRef}
    />
  );
}
