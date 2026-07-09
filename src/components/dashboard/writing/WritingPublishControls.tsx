"use client";

import type { WritingDocument, WritingSaveState } from "./writing-types";

type WritingPublishControlsProps = {
  document: WritingDocument;
  onUnpublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  saveState: WritingSaveState;
};

const getStatusLabel = (document: WritingDocument) => {
  if (document.status === "published") return "已发布";
  if (document.status === "archived") return "已归档";
  return "草稿";
};

export function WritingPublishControls({
  document,
  onUnpublish,
  saveState,
}: WritingPublishControlsProps) {
  const busy = saveState === "saving";

  return (
    <section className="sunny-writing-side-section" aria-label="发布">
      <div className="sunny-writing-publish-head">
        <h3>发布</h3>
        <span className="sunny-writing-status-chip" data-status={document.status}>
          {getStatusLabel(document)}
        </span>
      </div>

      <div className="sunny-writing-publish-actions">
        {document.status === "published" ? (
          <button disabled={busy} onClick={() => void onUnpublish(document)} type="button">
            转回草稿
          </button>
        ) : document.status === "archived" ? (
          <p className="sunny-writing-side-muted">已归档的文档。如需重新发布，请先转回草稿。</p>
        ) : (
          <p className="sunny-writing-side-muted">在编辑器顶栏发布此文档。</p>
        )}
        {document.publicHref ? (
          <a
            className="sunny-writing-publish-link"
            href={document.publicHref}
            rel="noreferrer"
            target="_blank"
          >
            公开页
          </a>
        ) : null}
      </div>
    </section>
  );
}
