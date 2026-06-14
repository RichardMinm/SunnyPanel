import { MarkdownContent } from "@/components/editor/MarkdownContent";
import { isRichContentDocument } from "@/lib/rich-content/validate";

import { RichContentRenderer } from "./RichContentRenderer";

type ContentRendererProps = {
  className?: string;
  content: unknown;
  fallbackMarkdown?: unknown;
};

export function ContentRenderer({ className, content, fallbackMarkdown }: ContentRendererProps) {
  if (isRichContentDocument(content)) {
    return <RichContentRenderer className={className} content={content} />;
  }

  const markdown = typeof content === "string" && content.trim()
    ? content
    : typeof fallbackMarkdown === "string"
      ? fallbackMarkdown
      : "";

  if (!markdown.trim()) {
    return null;
  }

  return <MarkdownContent className={className} markdown={markdown} />;
}

/** 兼容旧调用名；实际会优先渲染 rich content，再回退 Markdown。 */
export function MarkdownField({
  className,
  content,
  fallbackMarkdown,
}: {
  className?: string;
  content: unknown;
  fallbackMarkdown?: unknown;
}) {
  return <ContentRenderer className={className} content={content} fallbackMarkdown={fallbackMarkdown} />;
}
