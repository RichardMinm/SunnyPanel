"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ContentEditor } from "@/components/content-editor/ContentEditor";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";
import { createEmptyRichDocument } from "@/lib/rich-content/defaults";
import type { RichContentDocument } from "@/lib/rich-content/types";

import type {
  WritingDocument,
  WritingDocumentPatch,
  WritingSaveState,
} from "./writing-types";

type WritingEditorPaneProps = {
  document: null | WritingDocument;
  error: null | string;
  onSave: (document: WritingDocument, patch: WritingDocumentPatch) => Promise<null | WritingDocument>;
  saveState: WritingSaveState;
};

const canEditTitle = (document: WritingDocument) =>
  document.collection === "posts" || document.collection === "pages";

const getTitleValue = (document: WritingDocument) =>
  typeof document.metadata.title === "string" ? document.metadata.title : document.title;

export function WritingEditorPane({
  document,
  error,
  onSave,
  saveState,
}: WritingEditorPaneProps) {
  const [draftContent, setDraftContent] = useState<RichContentDocument>(() => createEmptyRichDocument());
  const [draftTitle, setDraftTitle] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!document) {
      setDraftContent(createEmptyRichDocument());
      setDraftTitle("");
      setIsDirty(false);
      return;
    }

    setDraftContent(document.contentRich);
    setDraftTitle(getTitleValue(document));
    setIsDirty(false);
  }, [document]);

  const headerLabel = useMemo(() => {
    if (!document) {
      return "选择或新建内容";
    }

    return dashboardContentLabels[document.collection];
  }, [document]);

  const handleContentChange = useCallback((content: RichContentDocument) => {
    setDraftContent(content);
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!document) {
      return;
    }

    const patch: WritingDocumentPatch = {
      contentRich: draftContent,
    };

    if (canEditTitle(document)) {
      patch.title = draftTitle.trim() || document.title;
    }

    const saved = await onSave(document, patch);
    if (saved) {
      setIsDirty(false);
    }
  }, [document, draftContent, draftTitle, onSave]);

  const saveLabel =
    saveState === "saving"
      ? "保存中"
      : saveState === "saved"
        ? "已保存"
        : isDirty
          ? "有未保存修改"
          : "已同步";

  if (!document) {
    return (
      <section className="sunny-writing-editor-pane" aria-label="编辑器">
        <div className="sunny-writing-empty-state">
          <p>{headerLabel}</p>
          <h2>从左侧选择一篇内容，或新建文章、短札、动态、页面。</h2>
        </div>
      </section>
    );
  }

  return (
    <section className="sunny-writing-editor-pane" aria-label="编辑器">
      <div className="sunny-writing-editor-topbar">
        <span>{headerLabel}</span>
        <div className="sunny-writing-save-state" data-state={saveState}>
          {error ?? saveLabel}
        </div>
        <button
          className="sunny-writing-primary-button"
          disabled={!isDirty || saveState === "saving"}
          onClick={handleSave}
          type="button"
        >
          保存
        </button>
      </div>

      <div className="sunny-writing-editor-canvas">
        {canEditTitle(document) ? (
          <input
            aria-label="标题"
            className="sunny-writing-title-input"
            onChange={(event) => {
              setDraftTitle(event.target.value);
              setIsDirty(true);
            }}
            placeholder="写下标题"
            value={draftTitle}
          />
        ) : null}

        <ContentEditor
          autoFocus
          className="sunny-writing-tiptap-editor"
          content={draftContent}
          disabled={saveState === "saving"}
          onChange={handleContentChange}
        />
      </div>
    </section>
  );
}
