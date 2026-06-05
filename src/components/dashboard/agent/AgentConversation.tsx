"use client";

import { type RefObject, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentChatMessage, AgentTokenUsage, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";

import { AgentThinkingPanel } from "./AgentThinkingPanel";
import { ThreadHeader } from "./ThreadHeader";
import { MessageCard } from "./MessageCard";

const messageVariants = {
  assistant: { animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, initial: { opacity: 0, x: -12 } },
  user: { animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, initial: { opacity: 0, x: 12 } },
};

type AgentConversationProps = {
  displayTitle: string;
  errorMessage: null | string;
  isThinking: boolean;
  isSubmitting: boolean;
  lastInteractionAt: null | string;
  messages: AgentChatMessage[];
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;
  statusLabel: string;
  thinkingContent: string;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
  traceSteps: AgentTraceStep[];
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentConversation({
  displayTitle,
  errorMessage,
  isThinking,
  isSubmitting,
  lastInteractionAt,
  messages,
  onRenameThread,
  pendingAction,
  statusLabel,
  thinkingContent,
  threadId,
  tokenUsage,
  traceSteps,
  transcriptRef,
}: AgentConversationProps) {
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }

    return -1;
  }, [messages]);

  useEffect(() => {
    const transcript = transcriptRef.current;

    if (!transcript || !isThinking) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      transcript.scrollTo({
        behavior: "auto",
        top: transcript.scrollHeight,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isThinking, messages.length, thinkingContent, traceSteps.length, transcriptRef]);

  return (
    <section className="sunny-agent-conversation-surface">
      <ThreadHeader
        displayTitle={displayTitle}
        isSubmitting={isSubmitting}
        lastInteractionAt={lastInteractionAt}
        onRenameThread={onRenameThread}
        pendingAction={pendingAction}
        threadId={threadId}
        tokenUsage={tokenUsage}
      />
      <div ref={transcriptRef} className="sunny-agent-conversation-scroll" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 ? (
          <div className="sunny-agent-empty-state">
            <strong>准备好开始一次 Agent 会话</strong>
            <span>描述目标、约束或需要推进的任务，Agent 会自动判断是咨询、规划还是执行。</span>
          </div>
        ) : (
          <>
            <AnimatePresence initial={false}>
              {messages.map((message, index) => {
                const variant = messageVariants[message.role === "assistant" ? "assistant" : "user"];
                const isStreamingMsg = isSubmitting && message.role === "assistant" && index === lastAssistantIndex;

                return (
                  <motion.div
                    key={`${message.role}-${index}`}
                    className={`sunny-agent-message-row sunny-agent-message-row-${message.role}`}
                    initial={variant.initial}
                    animate={variant.animate}
                    exit={variant.exit}
                    transition={{ duration: 0.25 }}
                  >
                    <MessageCard
                      content={message.content || (isSubmitting && index === messages.length - 1 ? "正在生成回复..." : "")}
                      isStreaming={isStreamingMsg}
                      role={message.role}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
            <AgentThinkingPanel
              isThinking={isThinking}
              statusLabel={statusLabel}
              steps={traceSteps}
              thinkingContent={thinkingContent}
            />
          </>
        )}
      </div>
      {errorMessage ? <div className="sunny-agent-error-card-v2" role="alert">{errorMessage}</div> : null}
    </section>
  );
}
