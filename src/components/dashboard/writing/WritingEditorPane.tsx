"use client";

import { useCallback, useMemo, useState } from "react";

import { ContentEditor } from "@/components/content-editor/ContentEditor";
import type { EditorBubbleAiPayload } from "@/components/content-editor/EditorBubbleMenu";
import { dashboardContentLabels } from "@/lib/dashboard/content/config";
import { createEmptyRichDocument } from "@/lib/rich-content/defaults";

import { useWritingAssist, type WritingAssistAction } from "./use-writing-assist";
import { canEditTitle, showsSummaryField } from "./writing-metadata";
import { WritingStats } from "./WritingStats";
import type { WritingDocument, WritingDraft, WritingSaveState } from "./writing-types";

type WritingEditorPaneProps = {
  document: null | WritingDocument;
  draft: WritingDraft | null;
  error: null | string;
  focusMode: boolean;
  isDirty: boolean;
  onFlushSave: () => Promise<null | WritingDocument>;
  onPublish: (document: WritingDocument) => Promise<null | WritingDocument>;
  onToggleFocusMode: () => void;
  onTogglePreviewMode: () => void;
  onUpdateDraft: (patch: Partial<WritingDraft>) => void;
  saveState: WritingSaveState;
};

const saveStateLabel = (saveState: WritingSaveState, isDirty: boolean, error: null | string) => {
  if (error) {
    return error;
  }

  if (saveState === "saving") {
    return "保存中...";
  }

  if (saveState === "saved") {
    return "已保存";
  }

  if (saveState === "error") {
    return "保存失败";
  }

  if (isDirty || saveState === "dirty") {
    return "有未保存修改";
  }

  return "已保存";
};

type WritingAssistExtra = {
  replaceSelection?: EditorBubbleAiPayload["replaceSelection"];
  text?: string;
};

export function WritingEditorPane({
  document,
  draft,
  error,
  focusMode,
  isDirty,
  onFlushSave,
  onPublish,
  onToggleFocusMode,
  onTogglePreviewMode,
  onUpdateDraft,
  saveState,
}: WritingEditorPaneProps) {
  const { isLoading: aiLoading, rememberStyle, runAssist } = useWritingAssist();
  const [publishError, setPublishError] = useState<null | string>(null);

  const headerLabel = useMemo(() => {
    if (!document) {
      return "Dashboard Studio";
    }

    return `${dashboardContentLabels[document.collection]} / Dashboard Studio`;
  }, [document]);

  const handleAssist = useCallback(
    async (action: WritingAssistAction, extra?: WritingAssistExtra) => {
      if (!document || !draft) {
        return;
      }

      const response = await runAssist(action, {
        collection: document.collection,
        contentRich: draft.contentRich,
        summary: draft.summary,
        text: extra?.text,
        title: draft.title,
      });

      if (!response) {
        return;
      }

      if (response.result) {
        if (action === "generate_title") {
          onUpdateDraft({ title: response.result });
          return;
        }

        if (action === "generate_summary") {
          onUpdateDraft({ summary: response.result });
          return;
        }

        if (action === "continue") {
          const nextContent = {
            ...draft.contentRich,
            content: [
              ...(draft.contentRich.content ?? []),
              {
                content: [{ text: response.result, type: "text" }],
                type: "paragraph",
              },
            ],
          };
          onUpdateDraft({ contentRich: nextContent });
          return;
        }

        if (extra?.text && extra.replaceSelection) {
          extra.replaceSelection(response.result);
          // 选区改写被应用回文档即视为用户显式采纳 → 沉淀为 writing_style 记忆。
          if (["condense", "expand", "polish", "rewrite"].includes(action)) {
            void rememberStyle(action, response.result, {
              collection: document.collection,
              text: extra.text,
            });
          }
        }
      }

      if (response.tags?.length) {
        onUpdateDraft({
          metadata: {
            ...draft.metadata,
            tags: response.tags.join(", "),
          },
        });
      }
    },
    [document, draft, onUpdateDraft, rememberStyle, runAssist],
  );

  const handlePublish = useCallback(async () => {
    if (!document || !draft) {
      return;
    }

    if (canEditTitle(document) && !draft.title.trim()) {
      setPublishError("发布前请先填写标题");
      return;
    }

    setPublishError(null);
    await onPublish(document);
  }, [document, draft, onPublish]);

  if (!document || !draft) {
    return (
      <section className="sunny-writing-editor-pane" aria-label="编辑器">
        <div className="sunny-writing-empty-state">
          <p>{headerLabel}</p>
          <h2>输入标题，开始写作</h2>
          <p className="sunny-writing-side-muted">或从左侧内容库选择一篇文档。</p>
        </div>
      </section>
    );
  }

  const statusLabel = saveStateLabel(saveState, isDirty, error);

  return (
    <section
      className={`sunny-writing-editor-pane${focusMode ? " is-focus-mode" : ""}`}
      aria-label="编辑器"
    >
      <div className="sunny-writing-editor-topbar">
        {focusMode ? (
          <button
            className="sunny-writing-secondary-button"
            onClick={onToggleFocusMode}
            type="button"
          >
            ← 退出专注
          </button>
        ) : (
          <span>{headerLabel}</span>
        )}

        {focusMode ? (
          <strong className="sunny-writing-focus-title">{draft.title || "未命名内容"}</strong>
        ) : null}

        <div className="sunny-writing-topbar-actions">
          <div className="sunny-writing-save-state" data-state={saveState}>
            {aiLoading ? "AI 处理中..." : statusLabel}
          </div>
          {!focusMode ? (
            <>
              <button
                className="sunny-writing-secondary-button"
                onClick={onToggleFocusMode}
                title="专注写作模式"
                type="button"
              >
                专注
              </button>
              <button
                className="sunny-writing-secondary-button"
                onClick={onTogglePreviewMode}
                title="预览"
                type="button"
              >
                预览
              </button>
              <button
                className="sunny-writing-secondary-button"
                disabled={!isDirty || saveState === "saving"}
                onClick={() => void onFlushSave()}
                type="button"
              >
                保存
              </button>
            </>
          ) : null}
          <button
            className="sunny-writing-primary-button"
            disabled={saveState === "saving"}
            onClick={() => void handlePublish()}
            type="button"
          >
            发布
          </button>
        </div>
      </div>

      {publishError ? <p className="sunny-writing-inline-error">{publishError}</p> : null}

      <div className="sunny-writing-editor-canvas">
        {canEditTitle(document) ? (
          <div className="sunny-writing-title-row">
            <input
              aria-label="标题"
              className="sunny-writing-title-input"
              onChange={(event) => onUpdateDraft({ title: event.target.value })}
              placeholder="输入标题..."
              value={draft.title}
            />
            <button
              className="sunny-writing-ai-inline-button"
              disabled={aiLoading}
              onClick={() => void handleAssist("generate_title")}
              type="button"
            >
              生成标题
            </button>
          </div>
        ) : null}

        {showsSummaryField(document.collection) ? (
          <div className="sunny-writing-summary-row">
            <textarea
              aria-label="摘要"
              className="sunny-writing-summary-input"
              onChange={(event) => onUpdateDraft({ summary: event.target.value })}
              placeholder="可选：写一句摘要..."
              rows={2}
              value={draft.summary}
            />
            <button
              className="sunny-writing-ai-inline-button"
              disabled={aiLoading}
              onClick={() => void handleAssist("generate_summary")}
              type="button"
            >
              自动生成摘要
            </button>
          </div>
        ) : null}

        <ContentEditor
          autoFocus
          className="sunny-writing-tiptap-editor"
          content={draft.contentRich ?? createEmptyRichDocument()}
          disabled={saveState === "saving"}
          onAiBubbleAction={(payload) =>
            void handleAssist(payload.action, {
              replaceSelection: payload.replaceSelection,
              text: payload.selectedText,
            })
          }
          onAiToolbarAction={(action) => void handleAssist(action)}
          onChange={(contentRich) => onUpdateDraft({ contentRich })}
          variant="writing"
        />
        <WritingStats
          contentJson={draft.contentRich}
          lastEdited={document.updatedAt}
          title={draft.title}
        />
      </div>
    </section>
  );
}
