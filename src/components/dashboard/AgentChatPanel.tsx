"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AgentDock,
  AgentWorkbench,
  type AgentInspectorTab,
  type AgentRunSummary,
  type AgentThreadSummary,
  type AgentWorkbenchMode,
  type AgentWorkbenchTab,
  type ContextPreferences,
} from "@/components/dashboard/agent";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentTokenUsage,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import {
  createTokenUsageSnapshot,
  estimateMessagesTokenCount,
  estimateTokenCount,
} from "@/lib/agent/token-usage";

const initialMessages: AgentChatMessage[] = [
  {
    content: "直接告诉我你想推进什么，我会把它整理成计划、清单或进度动作。",
    role: "assistant",
  },
];

const thinkingStatusKeywords = [
  "解析", "执行", "评估", "处理中", "整理", "生成", "恢复",
  "加载", "分析", "识别", "预检", "确认", "取消", "写入", "组织",
  "Dry-run", "意图",
];

const engineLabelMap: Record<AgentChatResponse["engine"], string> = {
  glm: "GLM 解析",
  heuristic: "规则解析",
  model: "模型解析",
  openai: "OpenAI 解析",
  "openai-compatible": "兼容模型解析",
  workflow: "流程接力",
  zai: "Z.ai 解析",
};

const getTokenUsageFromData = (data: unknown): AgentTokenUsage | null => {
  if (!data || typeof data !== "object" || !("tokenUsage" in data)) {
    return null;
  }

  const tokenUsage = data.tokenUsage;

  if (!tokenUsage || typeof tokenUsage !== "object" || !("totalTokens" in tokenUsage)) {
    return null;
  }

  return tokenUsage as AgentTokenUsage;
};

const parseStreamBlock = (block: string) => {
  const lines = block.split("\n");
  const event = lines.find((line) => line.startsWith("event:"))?.replace("event:", "").trim();
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace("data:", "").trim())
    .join("\n");

  if (!event || !dataText) {
    return null;
  }

  try {
    return {
      data: JSON.parse(dataText) as unknown,
      event,
    };
  } catch {
    return null;
  }
};

export type AgentChatPanelProps = {
  fullConsoleHref?: string;
  initialThreadId?: number;
  quickPrompts?: AgentQuickPrompt[];
  suggestions?: AgentInboxSuggestion[];
  variant?: "full" | "sidebar";
};

export function AgentChatPanel({
  fullConsoleHref = "/dashboard?agent=full",
  initialThreadId,
  quickPrompts = [],
  suggestions = [],
  variant = "full",
}: AgentChatPanelProps) {
  const isSidebar = variant === "sidebar";
  const shouldReduceMotion = useReducedMotion();
  const [messages, setMessages] = useState<AgentChatMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<null | PendingAction>(null);
  const [threadId, setThreadId] = useState<null | number>(null);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const [recentRuns, setRecentRuns] = useState<AgentRunSummary[]>([]);
  const [inboxSuggestions, setInboxSuggestions] = useState<AgentInboxSuggestion[]>(suggestions);
  const [statusText, setStatusText] = useState("已就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<"idle" | "responding" | "thinking">("idle");
  const [traceSteps, setTraceSteps] = useState<AgentTraceStep[]>([]);
  const [workbenchMode, setWorkbenchMode] = useState<AgentWorkbenchMode>("timeline");
  const [activeWorkbenchTab, setActiveWorkbenchTab] = useState<AgentWorkbenchTab>("timeline");
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
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputTokenEstimate = estimateTokenCount(input);
  const isThinking = isSubmitting && streamingState !== "responding";
  const effectiveFullConsoleHref = threadId ? `/dashboard?agent=full&threadId=${threadId}` : fullConsoleHref;
  const statusLabel = useMemo(() => {
    if (!isSubmitting) {
      return statusText;
    }

    if (thinkingStatusKeywords.some((keyword) => statusText.includes(keyword))) {
      return statusText;
    }

    return streamingState === "responding" ? "Agent 正在组织回复..." : "Agent 正在理解上下文...";
  }, [isSubmitting, statusText, streamingState]);

  const loadThread = useCallback(async (nextThreadId?: number, options?: { preserveInspector?: boolean }) => {
    const response = await fetch(nextThreadId ? `/api/agent/thread?threadId=${nextThreadId}` : "/api/agent/thread", {
      method: "GET",
    });

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as {
      selectedThread?: {
        id: number;
        messages: AgentChatMessage[];
        pendingAction: null | PendingAction;
        title: string;
      } | null;
      recentRuns?: AgentRunSummary[];
      threads?: AgentThreadSummary[];
    };

    setThreads(data.threads ?? []);
    setRecentRuns(data.recentRuns ?? []);

    if (data.selectedThread) {
      setThreadId(data.selectedThread.id);
      setPendingAction(data.selectedThread.pendingAction);
      setMessages(data.selectedThread.messages.length > 0 ? data.selectedThread.messages : initialMessages);
      setTokenUsage(
        createTokenUsageSnapshot({
          contextTokens: estimateMessagesTokenCount(data.selectedThread.messages),
        }),
      );
      setTraceSteps([]);
      setLastRollbackPayload(null);
      setArtifactsRollbackError(null);
      if (!options?.preserveInspector) {
        setActiveInspectorTab(data.selectedThread.pendingAction?.type === "await_confirmation" ? "changes" : "context");
      }
      setStatusText(isSidebar ? `已恢复 #${data.selectedThread.id}` : `已恢复 Thread #${data.selectedThread.id}`);
    }
  }, [isSidebar]);

  const upsertTraceStep = (nextStep: AgentTraceStep) => {
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
  };

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

  const appendStreamingAssistantContent = (content: string) => {
    setStreamingState("responding");
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
  };

  const replaceStreamingAssistantContent = (content: string) => {
    setMessages((current) => {
      const nextMessages = [...current];
      const lastMessage = nextMessages[nextMessages.length - 1];

      if (lastMessage?.role !== "assistant") {
        return current;
      }

      nextMessages[nextMessages.length - 1] = {
        ...lastMessage,
        content,
      };

      return nextMessages;
    });
  };

  const readStreamResponse = async (response: Response, nextHistory: AgentChatMessage[]) => {
    const reader = response.body?.getReader();

    if (!reader) {
      throw new Error("Agent 没有返回可读取的流。");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let doneData: (Partial<AgentChatResponse> & { assistantMessage?: string }) | null = null;

    setMessages([
      ...nextHistory,
      {
        content: "",
        role: "assistant",
      },
    ]);
    setStreamingState("thinking");

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const parsedBlock = parseStreamBlock(block);

        if (!parsedBlock) {
          continue;
        }

        if (parsedBlock.event === "status" && typeof parsedBlock.data === "object" && parsedBlock.data && "status" in parsedBlock.data) {
          const status = parsedBlock.data.status;

          if (typeof status === "string") {
            setStatusText(status);
          }
        }

        if (parsedBlock.event === "usage") {
          const nextTokenUsage = parsedBlock.data as AgentTokenUsage;

          if (typeof nextTokenUsage?.totalTokens === "number") {
            setTokenUsage(nextTokenUsage);
          }
        }

        if (parsedBlock.event === "meta") {
          const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

          if (nextTokenUsage) {
            setTokenUsage(nextTokenUsage);
          }
        }

        if (parsedBlock.event === "trace" && typeof parsedBlock.data === "object" && parsedBlock.data && "id" in parsedBlock.data) {
          upsertTraceStep(parsedBlock.data as AgentTraceStep);
        }

        if (parsedBlock.event === "token" && typeof parsedBlock.data === "object" && parsedBlock.data && "content" in parsedBlock.data) {
          const content = parsedBlock.data.content;
          const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

          if (typeof content === "string") {
            appendStreamingAssistantContent(content);
          }

          if (nextTokenUsage) {
            setTokenUsage(nextTokenUsage);
          }
        }

        if (parsedBlock.event === "done" && typeof parsedBlock.data === "object" && parsedBlock.data) {
          doneData = parsedBlock.data as Partial<AgentChatResponse> & {
            assistantMessage?: string;
          };
          const nextTokenUsage = getTokenUsageFromData(parsedBlock.data);

          if (nextTokenUsage) {
            setTokenUsage(nextTokenUsage);
          }
        }

        if (parsedBlock.event === "error" && typeof parsedBlock.data === "object" && parsedBlock.data && "assistantMessage" in parsedBlock.data) {
          const assistantMessage = parsedBlock.data.assistantMessage;

          if (typeof assistantMessage === "string") {
            doneData = {
              assistantMessage,
              engine: "workflow",
              intent: "clarify",
              pendingAction: null,
            };
            replaceStreamingAssistantContent(assistantMessage);
          }
        }
      }
    }

    if (buffer.trim()) {
      const parsedBlock = parseStreamBlock(buffer.trim());

      if (parsedBlock?.event === "done" && typeof parsedBlock.data === "object" && parsedBlock.data) {
        doneData = parsedBlock.data as Partial<AgentChatResponse> & {
          assistantMessage?: string;
        };
      }
    }

    if (typeof doneData?.assistantMessage === "string") {
      replaceStreamingAssistantContent(doneData.assistantMessage);
    }

    return doneData;
  };

  const abortRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const sendMessage = async (
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
    setMessages(nextHistory);
    setStatusText("正在让 Agent 解析并执行...");
    setStreamingState("thinking");
    setTraceSteps([]);
    setActiveWorkbenchTab("timeline");
    setActiveInspectorTab("context");
    setTokenUsage(
      createTokenUsageSnapshot({
        contextTokens: estimateMessagesTokenCount(messages),
        inputTokens: estimateTokenCount(nextMessage),
      }),
    );

    try {
      const hasPreferences = contextPreferences.pinned.length > 0 || contextPreferences.excluded.length > 0;
      const response = await fetch("/api/agent/chat", {
        body: JSON.stringify({
          confirmation: options?.confirmation,
          ...(hasPreferences ? { contextPreferences } : {}),
          message: nextMessage,
          messages: nextHistory,
          pendingAction,
          stream: true,
          threadId,
          workbenchMode,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        signal: controller.signal,
      });
      const isStreamingResponse = response.headers.get("Content-Type")?.includes("text/event-stream");
      const data = isStreamingResponse
        ? await readStreamResponse(response, nextHistory)
        : ((await response.json()) as Partial<AgentChatResponse> & {
            assistantMessage?: string;
          });
      const responseData = data ?? {};
      const assistantMessage = typeof responseData.assistantMessage === "string" ? responseData.assistantMessage : null;

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
      if (responseData.pendingAction?.type === "await_confirmation") {
        setActiveInspectorTab("changes");
      } else if (assistantMessage) {
        setActiveInspectorTab("artifacts");
      }
      if (responseData.tokenUsage) {
        setTokenUsage(responseData.tokenUsage);
      }
      setStatusText(responseData.engine ? `最近一次：${engineLabelMap[responseData.engine]}` : "已完成");
      setStreamingState("idle");
      void loadThread(typeof responseData.threadId === "number" ? responseData.threadId : undefined, {
        preserveInspector: true,
      });
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
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在待确认状态变化时重绑；sendMessage 每帧更新会导致无意义抖动
  }, [pendingAction]);

  const updateSuggestionStatus = async (id: number, action: "accept" | "dismiss" | "done") => {
    const previous = inboxSuggestions;

    setInboxSuggestions((current) => current.filter((suggestion) => suggestion.id !== id));

    try {
      const response = await fetch("/api/agent/suggestions", {
        body: JSON.stringify({
          action,
          id,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "PATCH",
      });

      if (!response.ok) {
        throw new Error(`PATCH failed: ${response.status}`);
      }
    } catch {
      setInboxSuggestions(previous);
      setErrorMessage("操作建议更新失败，已恢复。");
    }
  };

  const runSuggestion = async (suggestion: AgentInboxSuggestion) => {
    await updateSuggestionStatus(suggestion.id, "accept");
    await sendMessage(suggestion.suggestedPrompt);
  };

  const resetThread = () => {
    setThreadId(null);
    setPendingAction(null);
    setMessages(initialMessages);
    setStatusText("已开启新任务");
    setStreamingState("idle");
    setTraceSteps([]);
    setLastRollbackPayload(null);
    setArtifactsRollbackError(null);
    setActiveWorkbenchTab("timeline");
    setInput("");
    setErrorMessage(null);
    setActiveInspectorTab("context");
    setTokenUsage(
      createTokenUsageSnapshot({
        contextTokens: estimateMessagesTokenCount(initialMessages),
      }),
    );
  };

  const submitInput = () => {
    void sendMessage(input);
  };

  const runPrompt = (prompt: string) => {
    void sendMessage(prompt);
  };

  const confirmApproval = () => {
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
  };

  const cancelApproval = () => {
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
  };

  const editApproval = (kind: "plan" | "schedule" | "generic") => {
    const prompt =
      kind === "schedule"
        ? "我想调整这个日程提案："
        : kind === "plan"
          ? "我想调整这个计划提案："
          : "我想调整这个待确认动作：";

    setInput(prompt);
    setStatusText("可以先取消当前提案，再描述你要调整的地方");
  };

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
      const data = (await res.json()) as { message?: string; result?: { auditWarning?: string } };

      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "回滚失败");
      }

      if (typeof data.result?.auditWarning === "string" && data.result.auditWarning.length > 0) {
        setStatusText(`已撤销；审计提示：${data.result.auditWarning}`);
      }

      setLastRollbackPayload(null);
      await loadThread(threadId ?? undefined, { preserveInspector: true });
    } catch (error) {
      setArtifactsRollbackError(error instanceof Error ? error.message : "回滚失败");
    } finally {
      setArtifactsRollbackBusy(false);
    }
  }, [lastRollbackPayload, loadThread, threadId]);

  const loadExistingThread = (nextThreadId: number) => {
    void loadThread(nextThreadId);
  };

  const runInboxSuggestion = (suggestion: AgentInboxSuggestion) => {
    void runSuggestion(suggestion);
  };

  if (isSidebar) {
    return (
      <AgentDock
        errorMessage={errorMessage}
        fullConsoleHref={effectiveFullConsoleHref}
        inboxSuggestions={inboxSuggestions}
        input={input}
        isSubmitting={isSubmitting}
        isThinking={isThinking}
        messages={messages}
        onCancelApproval={cancelApproval}
        onEditApproval={editApproval}
        onConfirmApproval={confirmApproval}
        onInputChange={setInput}
        onRunPrompt={runPrompt}
        onRunSuggestion={runInboxSuggestion}
        onSubmit={submitInput}
        pendingAction={pendingAction}
        quickPrompts={quickPrompts}
        statusLabel={statusLabel}
        threadId={threadId}
      />
    );
  }

  return (
    <AgentWorkbench
      activeInspectorTab={activeInspectorTab}
      activeTab={activeWorkbenchTab}
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
      onActiveTabChange={setActiveWorkbenchTab}
      onArtifactsRollback={runArtifactsRollback}
      onCancelApproval={cancelApproval}
      onEditApproval={editApproval}
      onConfirmApproval={confirmApproval}
      onInputChange={setInput}
      onLoadThread={loadExistingThread}
      onModeChange={setWorkbenchMode}
      onNewThread={resetThread}
      onRunPrompt={runPrompt}
      onRunSuggestion={runInboxSuggestion}
      onStop={stopGeneration}
      onSubmit={submitInput}
      onToggleContextExclude={toggleContextExclude}
      onToggleContextPin={toggleContextPin}
      pendingAction={pendingAction}
      quickPrompts={quickPrompts}
      recentRuns={recentRuns}
      statusLabel={statusLabel}
      threadId={threadId}
      threads={threads}
      tokenUsage={tokenUsage}
      traceSteps={traceSteps}
      transcriptRef={transcriptRef}
    />
  );
}
