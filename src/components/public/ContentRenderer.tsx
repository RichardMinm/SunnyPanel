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
