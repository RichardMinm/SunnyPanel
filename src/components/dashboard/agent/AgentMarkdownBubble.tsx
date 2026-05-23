"use client";

import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AgentMarkdownBubbleProps = {
  content: string;
  isStreaming?: boolean;
};

const remarkPlugins = [remarkGfm];

function AgentMarkdownBubbleInner({ content, isStreaming }: AgentMarkdownBubbleProps) {
  const trimmed = useMemo(() => content.trim(), [content]);

  if (!trimmed) {
    return null;
  }

  const looksLikeMarkdown =
    /^#{1,6}\s|```|\*\*|__|\[.*\]\(|^\s*[-*]\s|^\s*\d+\.\s|^\|/m.test(trimmed);

  if (!looksLikeMarkdown) {
    return (
      <p className="sunny-agent-bubble-plain">
        {trimmed}
        {isStreaming ? <span className="sunny-agent-stream-cursor" /> : null}
      </p>
    );
  }

  return (
    <div className="sunny-agent-bubble-markdown sunny-prose">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const codeString = String(children).replace(/\n$/, "");

            if (match) {
              return (
                <div className="sunny-agent-code-block">
                  <div className="sunny-agent-code-header">
                    <span>{match[1]}</span>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(codeString)}
                    >
                      复制
                    </button>
                  </div>
                  <pre><code className={className} {...props}>{children}</code></pre>
                </div>
              );
            }

            return <code className={className} {...props}>{children}</code>;
          },
          pre({ children }) {
            return <>{children}</>;
          },
        }}
      >
        {trimmed}
      </ReactMarkdown>
      {isStreaming ? <span className="sunny-agent-stream-cursor" /> : null}
    </div>
  );
}

export const AgentMarkdownBubble = memo(AgentMarkdownBubbleInner);
