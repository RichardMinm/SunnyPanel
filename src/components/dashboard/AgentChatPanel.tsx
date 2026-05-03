"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const quickPrompts = [
  {
    label: "新计划",
    prompt: "帮我创建计划：整理计算机组成原理复习路径",
  },
  {
    label: "补条目",
    prompt: "给高等数学的映射与函数补一个条目：反函数习题复盘",
  },
  {
    label: "记完成",
    prompt: "我完成了高等数学的映射与函数",
  },
  {
    label: "查进度",
    prompt: "查一下整体进度",
  },
  {
    label: "评估",
    prompt: "评估整体计划",
  },
];

const initialMessages: AgentChatMessage[] = [
  {
    content: "直接告诉我你想推进什么，我会把它整理成计划、清单或进度动作。",
    role: "assistant",
  },
];

const traceKindLabelMap: Record<AgentTraceStep["kind"], string> = {
  action: "执行",
  analysis: "判断",
  complete: "完成",
  context: "上下文",
  error: "失败",
  write: "写入",
};

const getTraceSummary = (steps: AgentTraceStep[]) => {
  const runningStep = [...steps].reverse().find((step) => step.status === "running");
  const errorStep = [...steps].reverse().find((step) => step.status === "error");
  const doneCount = steps.filter((step) => step.status === "done").length;

  if (errorStep) {
    return errorStep.title;
  }

  if (runningStep) {
    return runningStep.title;
  }

  if (steps.length > 0) {
    return `${doneCount}/${steps.length} 步完成`;
  }

  return "等待指令";
};

const thinkingStatusKeywords = ["解析", "执行", "评估", "处理中", "整理", "生成", "恢复"];

type AgentThreadSummary = {
  id: number;
  lastInteractionAt?: null | string;
  pendingAction: null | PendingAction;
  title: string;
};

const engineLabelMap: Record<AgentChatResponse["engine"], string> = {
  glm: "GLM 解析",
  heuristic: "规则解析",
  workflow: "流程接力",
};

const getPendingActionLabel = (pendingAction: PendingAction) => {
  if (pendingAction.type === "await_completion_note") {
    return `等待补备注：${pendingAction.itemTitle}`;
  }

  return `等待澄清：${pendingAction.missingFields.join(" / ") || pendingAction.intent}`;
};

const formatTokenCount = (value?: number) => new Intl.NumberFormat("zh-CN").format(Math.max(0, Math.round(value ?? 0)));

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

const getUsagePercent = (value: number, total: number) => {
  if (total <= 0 || value <= 0) {
    return 0;
  }

  return Math.max(4, Math.round((value / total) * 100));
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

type AgentChatPanelProps = {
  variant?: "full" | "sidebar";
};

export function AgentChatPanel({ variant = "full" }: AgentChatPanelProps) {
  const isSidebar = variant === "sidebar";
  const shouldReduceMotion = useReducedMotion();
  const [messages, setMessages] = useState<AgentChatMessage[]>(initialMessages);
  const [pendingAction, setPendingAction] = useState<null | PendingAction>(null);
  const [threadId, setThreadId] = useState<null | number>(null);
  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [threads, setThreads] = useState<AgentThreadSummary[]>([]);
  const [statusText, setStatusText] = useState("已就绪");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<"idle" | "responding" | "thinking">("idle");
  const [traceSteps, setTraceSteps] = useState<AgentTraceStep[]>([]);
  const [tokenUsage, setTokenUsage] = useState<AgentTokenUsage>(() =>
    createTokenUsageSnapshot({
      contextTokens: estimateMessagesTokenCount(initialMessages),
    }),
  );
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const inputTokenEstimate = estimateTokenCount(input);
  const usageTotal = Math.max(tokenUsage.totalTokens, 1);
  const traceSummary = getTraceSummary(traceSteps);
  const lastMessage = messages[messages.length - 1];
  const isAssistantPlaceholderActive =
    lastMessage?.role === "assistant" && lastMessage.content.length === 0 && isSubmitting;
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

  const loadThread = useCallback(async (nextThreadId?: number) => {
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
      threads?: AgentThreadSummary[];
    };

    setThreads(data.threads ?? []);

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
      void loadThread();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadThread]);

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

  const sendMessage = async (message: string) => {
    const nextMessage = message.trim();

    if (!nextMessage || isSubmitting) {
      return;
    }

    const nextHistory = [...messages, { content: nextMessage, role: "user" as const }];

    setIsSubmitting(true);
    setInput("");
    setErrorMessage(null);
    setMessages(nextHistory);
    setStatusText("正在让 Agent 解析并执行...");
    setStreamingState("thinking");
    setTraceSteps([]);
    setTokenUsage(
      createTokenUsageSnapshot({
        contextTokens: estimateMessagesTokenCount(messages),
        inputTokens: estimateTokenCount(nextMessage),
      }),
    );

    try {
      const response = await fetch("/api/agent/chat", {
        body: JSON.stringify({
          message: nextMessage,
          messages: nextHistory,
          pendingAction,
          stream: true,
          threadId,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
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
      setTraceSteps(responseData.trace ?? []);
      setThreadId(typeof responseData.threadId === "number" ? responseData.threadId : threadId);
      if (responseData.tokenUsage) {
        setTokenUsage(responseData.tokenUsage);
      }
      setStatusText(responseData.engine ? `最近一次：${engineLabelMap[responseData.engine]}` : "已完成");
      setStreamingState("idle");
      void loadThread(typeof responseData.threadId === "number" ? responseData.threadId : undefined);
    } catch (error) {
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
      setIsSubmitting(false);
    }
  };

  const shouldShowTrace = traceSteps.length > 0 || isAssistantPlaceholderActive;
  const renderTraceProcess = () => (
    <motion.div
      key="agent-process"
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="sunny-agent-line sunny-agent-line-process"
    >
      <div className="sunny-agent-line-label">Process</div>
      <div className="sunny-agent-line-body">
        <div className="sunny-agent-process-head">
          <span className={`sunny-agent-presence-dot ${isThinking ? "sunny-agent-presence-dot-live" : ""}`} aria-hidden="true" />
          <span>{traceSummary}</span>
        </div>
        <div className="sunny-agent-process-list">
          {traceSteps.length > 0 ? (
            traceSteps.map((step) => (
              <div key={step.id} className={`sunny-agent-process-step sunny-agent-process-step-${step.status}`}>
                <span className={`sunny-agent-trace-dot sunny-agent-trace-dot-${step.status}`} aria-hidden="true" />
                <span className={`sunny-agent-trace-pill sunny-agent-trace-pill-${step.kind}`}>
                  {traceKindLabelMap[step.kind]}
                </span>
                <span className="sunny-agent-process-title">{step.title}</span>
                {step.detail ? <span className="sunny-agent-process-detail">{step.detail}</span> : null}
              </div>
            ))
          ) : (
            <div className="sunny-agent-process-step sunny-agent-process-step-running">
              <span className="sunny-agent-trace-dot sunny-agent-trace-dot-running" aria-hidden="true" />
              <span className="sunny-agent-trace-pill sunny-agent-trace-pill-analysis">准备</span>
              <span className="sunny-agent-process-title">正在建立请求</span>
              <span className="sunny-agent-process-detail">等待服务端返回第一步执行状态。</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );

  return (
    <section className={`sunny-card sunny-agent-console p-0 ${isSidebar ? "sunny-agent-sidebar" : "rounded-[1.4rem]"}`}>
      <div className="sunny-agent-console-header">
        <div className="min-w-0">
          <p className="sunny-kicker text-xs text-muted">Assistant</p>
          <h2 className={`${isSidebar ? "mt-1 text-xl" : "mt-2 text-2xl"} font-semibold text-foreground`}>
            {isSidebar ? "助手" : "用一句话驱动工作流"}
          </h2>
          {!isSidebar ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
              直接描述目标、进度或问题，我会把过程和结果沉淀到工作台里。
            </p>
          ) : null}
        </div>

        <div className="sunny-agent-console-status">
          <span className="sunny-agent-status rounded-full px-3 py-1 text-xs">{statusLabel}</span>
          {pendingAction ? (
            <span className="sunny-agent-status sunny-agent-status-warn rounded-full px-3 py-1 text-xs">
              {getPendingActionLabel(pendingAction)}
            </span>
          ) : null}
          {threadId ? <span className="sunny-agent-status rounded-full px-3 py-1 text-xs">Thread #{threadId}</span> : null}
        </div>
      </div>

      <div className="sunny-agent-command-bar">
        {quickPrompts.map((item) => (
          <button
            key={item.prompt}
            type="button"
            onClick={() => {
              void sendMessage(item.prompt);
            }}
            className="sunny-agent-quick text-left text-sm text-foreground transition"
          >
            {isSidebar ? item.label : item.prompt}
          </button>
        ))}
      </div>

      <div className="sunny-agent-thread-bar">
        <button
          type="button"
          onClick={() => {
            setThreadId(null);
            setPendingAction(null);
            setMessages(initialMessages);
            setStatusText("已开启新会话");
            setStreamingState("idle");
            setTraceSteps([]);
          }}
          className="sunny-agent-thread-button"
        >
          新会话
        </button>
        {threads.slice(0, isSidebar ? 2 : 4).map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => {
              void loadThread(thread.id);
            }}
            className={`sunny-agent-thread-button ${thread.id === threadId ? "sunny-agent-thread-button-active" : ""}`}
          >
            #{thread.id} {thread.title}
          </button>
        ))}
      </div>

      {!isSidebar ? (
        <div className="sunny-agent-meter-rail">
          <div className="sunny-agent-meter-item">
            <span>输入</span>
            <strong>{formatTokenCount(inputTokenEstimate)}</strong>
          </div>
          <div className="sunny-agent-meter-item">
            <span>上下文</span>
            <strong>{formatTokenCount(tokenUsage.contextTokens)}</strong>
          </div>
          <div className="sunny-agent-meter-item">
            <span>输出</span>
            <strong>{formatTokenCount(tokenUsage.outputTokens)}</strong>
          </div>
          <div className="sunny-agent-meter-item">
            <span>{tokenUsage.source === "provider" ? "API 回传" : "本地估算"}</span>
            <strong>{formatTokenCount(tokenUsage.totalTokens)}</strong>
          </div>
          <div className="sunny-agent-meter-track" aria-hidden="true">
            <span className="bg-sky-400" style={{ width: `${getUsagePercent(tokenUsage.contextTokens, usageTotal)}%` }} />
            <span className="bg-orange-400" style={{ width: `${getUsagePercent(tokenUsage.inputTokens, usageTotal)}%` }} />
            <span className="bg-emerald-400" style={{ width: `${getUsagePercent(tokenUsage.outputTokens, usageTotal)}%` }} />
          </div>
        </div>
      ) : null}

      <div className="sunny-agent-conversation">
        {!isSidebar ? (
          <div className="sunny-agent-conversation-head">
            <div>
              <p className="sunny-kicker text-[0.68rem] text-muted">Conversation</p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">Agent 对话流</h3>
            </div>
            <span className="text-xs text-muted">{isSubmitting ? "Streaming" : "Ready"}</span>
          </div>
        ) : null}

        <div ref={transcriptRef} className="sunny-agent-transcript">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => {
              const isAssistant = message.role === "assistant";
              const isStreamingPlaceholder =
                isAssistant && index === messages.length - 1 && isSubmitting && message.content.length === 0;
              const isCurrentStreamingMessage =
                isAssistant && index === messages.length - 1 && isSubmitting && message.content.length > 0;
              const shouldInsertProcess = shouldShowTrace && isAssistant && index === messages.length - 1;

              return (
                <div key={`${message.role}-${index}`}>
                  {shouldInsertProcess ? renderTraceProcess() : null}
                  {isStreamingPlaceholder ? null : (
                    <motion.div
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className={`sunny-agent-line ${isAssistant ? "sunny-agent-line-assistant" : "sunny-agent-line-user"}`}
                    >
                      <div className="sunny-agent-line-label">{isAssistant ? "Agent" : "You"}</div>
                      <div className="sunny-agent-line-body">
                        {message.content}
                        {isCurrentStreamingMessage ? <span className="sunny-agent-stream-cursor" aria-hidden="true" /> : null}
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
            {shouldShowTrace && lastMessage?.role !== "assistant" ? renderTraceProcess() : null}
          </AnimatePresence>
        </div>

        <div className="sunny-agent-conversation-foot">
          <span className={`sunny-agent-presence-dot ${isThinking ? "sunny-agent-presence-dot-live" : ""}`} aria-hidden="true" />
          <span>{statusLabel}</span>
        </div>

        <form
          className="sunny-agent-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage(input);
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={2}
            placeholder={pendingAction ? "直接补一句完成备注，或者说“不用了”。" : isSidebar ? "想做什么？" : "例如：帮我创建计划，整理计算机组成原理复习路径"}
            className="sunny-agent-input min-h-20 flex-1 rounded-[0.8rem] px-4 py-3 text-sm outline-none transition"
          />
          <button
            type="submit"
            disabled={isSubmitting || input.trim().length === 0}
            className="sunny-button-primary self-end disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "处理中" : "发送"}
          </button>
        </form>

        {errorMessage ? (
          <div className="mt-3 rounded-[0.8rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-700">
            {errorMessage}
          </div>
        ) : null}
      </div>
    </section>
  );
}
