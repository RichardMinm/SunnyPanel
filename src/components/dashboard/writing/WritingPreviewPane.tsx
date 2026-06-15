"use client";

import { RichContentRenderer } from "@/components/public/RichContentRenderer";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";

import type { WritingDocument, WritingDraft } from "./writing-types";

type WritingPreviewPaneProps = {
  document: WritingDocument;
  draft: WritingDraft;
  onBackToEdit: () => void;
};

export function WritingPreviewPane({ document, draft, onBackToEdit }: WritingPreviewPaneProps) {
  const previewTitle = draft.title.trim() || document.title || "未命名内容";
  const previewSummary = draft.summary.trim();

  return (
    <section className="sunny-writing-preview-pane" aria-label="预览">
      <div className="sunny-writing-editor-topbar">
        <span>{dashboardContentLabels[document.collection]} 预览</span>
        <button className="sunny-writing-secondary-button" onClick={onBackToEdit} type="button">
          返回编辑
        </button>
      </div>

      <div className={`sunny-writing-preview-canvas is-${document.collection}`}>
        <article className="sunny-writing-preview-article">
          <h1>{previewTitle}</h1>
          {previewSummary ? <p className="sunny-writing-preview-summary">{previewSummary}</p> : null}
          <RichContentRenderer className="sunny-writing-preview-rich" content={draft.contentRich} />
        </article>
      </div>
    </section>
  );
}
