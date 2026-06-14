"use client";

import type { WritingDocument, WritingSaveState } from "./writing-types";

type WritingPublishControlsProps = {
  document: WritingDocument;
  onPublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  onUnpublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  saveState: WritingSaveState;
};

const getStatusLabel = (document: WritingDocument) =>
  document.status === "published" ? "已发布" : "草稿";

export function WritingPublishControls({
  document,
  onPublish,
  onUnpublish,
  saveState,
}: WritingPublishControlsProps) {
  const busy = saveState === "saving";

  return (
    <section className="sunny-writing-side-section" aria-label="发布">
      <div className="sunny-writing-publish-head">
        <h3>发布</h3>
        <span data-status={document.status}>{getStatusLabel(document)}</span>
      </div>

      <div className="sunny-writing-publish-actions">
        {document.status === "published" ? (
          <button disabled={busy} onClick={() => void onUnpublish(document)} type="button">
            转回草稿
          </button>
        ) : (
          <button disabled={busy} onClick={() => void onPublish(document)} type="button">
            发布
          </button>
        )}
        <a href={document.advancedAdminHref} target="_blank" rel="noreferrer">
          高级 Admin
        </a>
        {document.publicHref ? (
          <a href={document.publicHref} target="_blank" rel="noreferrer">
            公开页
          </a>
        ) : null}
      </div>
    </section>
  );
}
