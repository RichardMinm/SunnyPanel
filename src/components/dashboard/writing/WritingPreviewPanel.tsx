"use client";

import type { WritingDocument } from "./writing-types";

type WritingPreviewPanelProps = {
  document: WritingDocument;
};

export function WritingPreviewPanel({ document }: WritingPreviewPanelProps) {
  const preview = document.contentExcerpt || document.contentText || "保存后这里会出现可被列表、搜索和 Agent 使用的摘要。";

  return (
    <section className="sunny-writing-side-section" aria-label="摘要预览">
      <h3>摘要</h3>
      <p className="sunny-writing-preview-text">{preview}</p>
    </section>
  );
}
