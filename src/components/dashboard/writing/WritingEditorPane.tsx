"use client";

import { useCallback, useMemo, useState } from "react";

import { ContentEditor } from "@/components/content-editor/ContentEditor";
import { DashboardIcon } from "@/components/dashboard/icons";
import type { EditorBubbleAiPayload } from "@/components/content-editor/EditorBubbleMenu";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
} from "@/components/primitives/AppDropdownMenu";
import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";
import { createEmptyRichDocument } from "@/lib/rich-content/defaults";

import { useWritingAssist, type WritingAssistAction } from "./use-writing-assist";
import { canEditTitle } from "./writing-metadata";
import { WritingPublishDialog, type WritingPublishVisibility } from "./WritingPublishDialog";
import type { WritingDocument, WritingDraft, WritingSaveState } from "./writing-types";

type WritingEditorPaneProps = {
  document: null | WritingDocument;
  draft: WritingDraft | null;
  error: null | string;
  focusMode: boolean;
  isDirty: boolean;
  onCreateDocument?: (collection: DashboardContentCollection) => void;
  onFlushSave: () => Promise<null | WritingDocument>;
  onOpenInspector?: () => void;
  onPublish: (
    document: WritingDocument,
    options?: { visibility?: WritingPublishVisibility },
  ) => Promise<null | WritingDocument>;
  onToggleFocusMode: () => void;
  onTogglePreviewMode: () => void;
  onUpdateDraft: (patch: Partial<WritingDraft>) => void;
  saveState: WritingSaveState;
};

const formatRelativeUpdate = (value: string) => {
  const updated = new Date(value).getTime();
  const diffMs = Date.now() - updated;

  if (Number.isNaN(updated)) {
    return "未知时间";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) {
    return "刚刚";
  }
  if (minutes < 60) {
    return `${minutes} 分钟前`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时前`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} 天前`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
};

const createOptions = dashboardContentCollections.map((collection) => ({
  collection,
  label: `新${dashboardContentLabels[collection]}`,
}));

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
  onCreateDocument,
  onFlushSave,
  onOpenInspector,
  onPublish,
  onToggleFocusMode,
  onTogglePreviewMode,
  onUpdateDraft,
  saveState,
}: WritingEditorPaneProps) {
  const { error: aiError, isLoading: aiLoading, rememberStyle, runAssist } = useWritingAssist();
  const [publishError, setPublishError] = useState<null | string>(null);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);

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

      if (response.outline?.length) {
        const nextContent = {
          ...draft.contentRich,
          content: [
            ...(draft.contentRich.content ?? []),
            ...response.outline.map((item) => ({
              attrs: { level: item.level },
              content: [{ text: item.text, type: "text" }],
              type: "heading",
            })),
          ],
        };
        onUpdateDraft({ contentRich: nextContent });
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

  const openPublishDialog = useCallback(() => {
    if (!document || !draft) {
      return;
    }

    if (canEditTitle(document) && !draft.title.trim()) {
      setPublishError("发布前请先填写标题");
      return;
    }

    setPublishError(null);
    setPublishDialogOpen(true);
  }, [document, draft]);

  const handlePublishConfirm = useCallback(
    async (visibility: WritingPublishVisibility) => {
      if (!document) {
        return;
      }

      setPublishBusy(true);
      const result = await onPublish(document, { visibility });
      setPublishBusy(false);

      if (result) {
        setPublishDialogOpen(false);
      }
    },
    [document, onPublish],
  );

  const documentByline = useMemo(() => {
    if (!document) {
      return "";
    }

    const parts = [
      `更新于 ${formatRelativeUpdate(document.updatedAt)}`,
      document.status === "published" ? "已发布" : "草稿",
      document.visibility === "public" ? "公开" : "仅自己可见",
    ];

    if (aiLoading) {
      parts.push("AI 处理中");
    }

    return parts.join(" · ");
  }, [aiLoading, document]);

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

  const showManualSave = isDirty && saveState !== "saving";

  return (
    <section
      className={`sunny-writing-editor-pane${focusMode ? " is-focus-mode" : ""}`}
      aria-label="编辑器"
    >
      <div className="sunny-writing-editor-topbar">
        {focusMode ? (
          <>
            <button
              className="sunny-writing-secondary-button"
              onClick={onToggleFocusMode}
              type="button"
            >
              ← 退出专注
            </button>
            <strong className="sunny-writing-focus-title">{draft.title || "未命名内容"}</strong>
          </>
        ) : (
          <nav aria-label="文档路径" className="sunny-writing-editor-breadcrumbs">
            <span className="sunny-writing-breadcrumb-root">内容</span>
            <span aria-hidden className="sunny-writing-breadcrumb-sep">
              /
            </span>
            <span className="sunny-writing-breadcrumb-segment">
              {dashboardContentLabels[document.collection]}
            </span>
            <span aria-hidden className="sunny-writing-breadcrumb-sep">
              /
            </span>
            <span className="sunny-writing-breadcrumb-current">{draft.title || "未命名内容"}</span>
          </nav>
        )}

        <div className="sunny-writing-topbar-actions">
          {showManualSave ? (
            <button
              className="sunny-writing-primary-button"
              onClick={() => void onFlushSave()}
              type="button"
            >
              保存编辑
            </button>
          ) : null}
          {onCreateDocument && !focusMode ? (
            <AppDropdownMenu
              align="end"
              className="sunny-writing-menu"
              side="bottom"
              sideOffset={6}
              trigger="+ 新建"
              triggerAriaLabel="新建内容"
              triggerClassName="sunny-writing-secondary-button"
            >
              <AppDropdownMenuLabel>新建</AppDropdownMenuLabel>
              {createOptions.map((option) => (
                <AppDropdownMenuItem
                  key={option.collection}
                  onSelect={() => onCreateDocument(option.collection)}
                >
                  {option.label}
                </AppDropdownMenuItem>
              ))}
            </AppDropdownMenu>
          ) : null}
          {!focusMode ? (
            <AppDropdownMenu
              align="end"
              className="sunny-writing-menu"
              side="bottom"
              sideOffset={6}
              trigger="···"
              triggerAriaLabel="更多操作"
              triggerClassName="sunny-writing-secondary-button sunny-writing-topbar-overflow"
            >
              <AppDropdownMenuItem onSelect={onToggleFocusMode}>专注写作</AppDropdownMenuItem>
              <AppDropdownMenuItem onSelect={onTogglePreviewMode}>预览</AppDropdownMenuItem>
              {onOpenInspector ? (
                <AppDropdownMenuItem onSelect={onOpenInspector}>打开属性</AppDropdownMenuItem>
              ) : null}
              <AppDropdownMenuItem onSelect={openPublishDialog}>发布</AppDropdownMenuItem>
            </AppDropdownMenu>
          ) : null}
        </div>
      </div>

      {publishError ? <p className="sunny-writing-inline-error">{publishError}</p> : null}
      {error ? <p className="sunny-writing-inline-error">{error}</p> : null}
      {aiError ? <p className="sunny-writing-inline-error">AI 辅助失败：{aiError}</p> : null}

      <div className="sunny-writing-editor-canvas">
        <div className="sunny-writing-document-header">
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
                className="sunny-writing-title-ai-ghost"
                data-title-empty={!draft.title.trim() ? "true" : "false"}
                disabled={aiLoading}
                onClick={() => void handleAssist("generate_title")}
                type="button"
              >
                ✨ 生成标题
              </button>
            </div>
          ) : null}

          <p className="sunny-writing-document-byline">{documentByline}</p>
        </div>

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
          onChange={(contentRich) => onUpdateDraft({ contentRich })}
          variant="writing"
        />
      </div>

      {document ? (
        <WritingPublishDialog
          busy={publishBusy}
          collectionLabel={dashboardContentLabels[document.collection]}
          onCancel={() => setPublishDialogOpen(false)}
          onConfirm={(visibility) => void handlePublishConfirm(visibility)}
          open={publishDialogOpen}
        />
      ) : null}
    </section>
  );
}
