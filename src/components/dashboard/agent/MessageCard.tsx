import { useState } from "react";
import { AgentMarkdownBubble } from "./AgentMarkdownBubble";
import { ScheduleResultCard } from "./ScheduleResultCard";
import { parseScheduleResultMessage } from "./utils";

type MessageCardProps = {
  content: string;
  isStreaming?: boolean;
  isThinking?: boolean;
  role: "assistant" | "user";
  thinkingContent?: string;
};

export function MessageCard({
  content,
  isStreaming,
  isThinking,
  role,
  thinkingContent,
}: MessageCardProps) {
  const scheduleResult = role === "assistant" ? parseScheduleResultMessage(content) : null;
  const [thinkingOpen, setThinkingOpen] = useState(isThinking === true);

  // 自动展开：正在思考时展开，思考完成后折叠
  if (isThinking && !thinkingOpen) {
    // 仅在流式思考中自动展开
  }

  const hasThinking = Boolean(thinkingContent?.trim());
  const thinkingSteps = hasThinking
    ? thinkingContent!.split(/\n{2,}/).filter(Boolean)
    : [];

  const body = (
    <div className="sunny-message-card-body">
      {role === "assistant" ? <span className="sunny-message-card-label">助手</span> : null}
      {role === "assistant" && hasThinking ? (
        <div className="sunny-thinking-fold">
          <button
            type="button"
            className="sunny-thinking-fold-header"
            onClick={() => setThinkingOpen((v) => !v)}
          >
            <span className={`sunny-thinking-fold-arrow${thinkingOpen ? " is-open" : ""}`}>▸</span>
            🧠 思考过程
            {thinkingSteps.length > 1 ? ` (${thinkingSteps.length} 步)` : ""}
          </button>
          {thinkingOpen ? (
            <div className="sunny-thinking-fold-body">{thinkingContent}</div>
          ) : null}
        </div>
      ) : null}
      {role === "assistant" ? (
        scheduleResult ? (
          <ScheduleResultCard result={scheduleResult} />
        ) : (
          <AgentMarkdownBubble
            content={content || (isStreaming ? "正在生成回复..." : "")}
            isStreaming={isStreaming && Boolean(content)}
          />
        )
      ) : (
        <p className="sunny-message-card-user-text">{content}</p>
      )}
    </div>
  );

  const avatar = (
    <div className="sunny-message-card-avatar" aria-hidden="true">
      {role === "assistant" ? "S" : "你"}
    </div>
  );

  return (
    <div className={`sunny-message-card sunny-message-card-${role}`}>
      {role === "user" ? (
        <>
          {body}
          {avatar}
        </>
      ) : (
        <>
          {avatar}
          {body}
        </>
      )}
    </div>
  );
}
