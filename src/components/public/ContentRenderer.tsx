import { MarkdownContent } from "@/components/editor/MarkdownContent";

type ContentRendererProps = {
  className?: string;
  content: unknown;
};

export function ContentRenderer({ className, content }: ContentRendererProps) {
  if (typeof content !== "string" || !content.trim()) {
    return null;
  }

  return <MarkdownContent className={className} markdown={content} />;
}

/** 与直接调用 `MarkdownContent` 等价，用于统一公开内容的 Markdown 入口。 */
export function MarkdownField({
  className,
  content,
}: {
  className?: string;
  content: unknown;
}) {
  if (typeof content !== "string") {
    return null;
  }

  return <MarkdownContent className={className} markdown={content} />;
}
