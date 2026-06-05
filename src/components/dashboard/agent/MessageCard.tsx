import { AgentMarkdownBubble } from "./AgentMarkdownBubble";

type MessageCardProps = {
  content: string;
  isStreaming?: boolean;
  role: "assistant" | "user";
};

export function MessageCard({ content, isStreaming, role }: MessageCardProps) {
  return (
    <div className={`sunny-message-card sunny-message-card-${role}`}>
      <div className="sunny-message-card-avatar" aria-hidden="true">
        {role === "assistant" ? "S" : "你"}
      </div>
      <div className="sunny-message-card-body">
        <span>{role === "assistant" ? "助手" : "你"}</span>
        {role === "assistant" ? (
          <AgentMarkdownBubble
            content={content || (isStreaming ? "正在生成回复..." : "")}
            isStreaming={isStreaming && Boolean(content)}
          />
        ) : (
          <p>{content}</p>
        )}
      </div>
    </div>
  );
}
