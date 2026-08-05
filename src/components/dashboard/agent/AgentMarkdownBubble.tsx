"use client";

import { Children, isValidElement, memo, useMemo, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type AgentMarkdownBubbleProps = {
  content: string;
  isStreaming?: boolean;
};

const remarkPlugins = [remarkGfm];

type MarkdownCodeElementProps = {
  children?: ReactNode;
  className?: string;
};

function AgentMarkdownBubbleInner({ content, isStreaming }: AgentMarkdownBubbleProps) {
  const trimmed = useMemo(() => content.trim(), [content]);

  if (!trimmed) {
    return null;
  }

  return (
    <div
      className="sunny-agent-bubble-markdown sunny-prose"
      data-streaming={isStreaming ? "true" : undefined}
    >
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        components={{
          code({ className, children, ...props }) {
            return <code className={className} {...props}>{children}</code>;
          },
          pre({ children }) {
            const child = Children.toArray(children)[0];
            const childProps = isValidElement<MarkdownCodeElementProps>(child)
              ? child.props
              : null;
            const className = childProps?.className ?? "";
            const language = /language-([\w-]+)/u.exec(className)?.[1] ?? "文本";
            const codeString = String(childProps?.children ?? "").replace(/\n$/, "");

            return (
              <div className="sunny-agent-code-block">
                <div className="sunny-agent-code-header">
                  <span>{language}</span>
                  <button
                    aria-label={`复制${language}代码`}
                    onClick={() => navigator.clipboard?.writeText(codeString)}
                    type="button"
                  >
                    复制
                  </button>
                </div>
                <pre>{children}</pre>
              </div>
            );
          },
          table({ children }) {
            return (
              <div className="sunny-agent-table-scroll" role="region" aria-label="表格内容" tabIndex={0}>
                <table>{children}</table>
              </div>
            );
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
