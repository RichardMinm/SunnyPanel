"use client";

import { type RefObject, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";

import type { AgentChatMessage } from "@/lib/agent/schemas";

import { AgentMarkdownBubble } from "./AgentMarkdownBubble";

const messageVariants = {
  assistant: { animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, initial: { opacity: 0, x: -12 } },
  user: { animate: { opacity: 1, x: 0 }, exit: { opacity: 0 }, initial: { opacity: 0, x: 12 } },
};

type AgentConversationProps = {
  errorMessage: null | string;
  isSubmitting: boolean;
  messages: AgentChatMessage[];
  statusLabel: string;
  transcriptRef: RefObject<HTMLDivElement | null>;
};

export function AgentConversation({
  errorMessage,
  isSubmitting,
  messages,
  statusLabel,
  transcriptRef,
}: AgentConversationProps) {
  const lastAssistantIndex = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return i;
    }

    return -1;
  }, [messages]);

  return (
    <section className="sunny-agent-conversation-surface">
      <div className="sunny-agent-run-surface-head">
        <div>
          <p>对话</p>
          <h2>对话记录</h2>
        </div>
        <span>{isSubmitting ? statusLabel : "已就绪"}</span>
      </div>
      <div ref={transcriptRef} className="sunny-agent-conversation-scroll" aria-live="polite" aria-relevant="additions">
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
                <span>{message.role === "assistant" ? "助手" : "你"}</span>
                {message.role === "assistant" ? (
                  <AgentMarkdownBubble
                    content={message.content || (isSubmitting && index === messages.length - 1 ? "正在生成回复..." : "")}
                    isStreaming={isStreamingMsg && Boolean(message.content)}
                  />
                ) : (
                  <p>{message.content}</p>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
      {errorMessage ? <div className="sunny-agent-error-card-v2" role="alert">{errorMessage}</div> : null}
    </section>
  );
}
