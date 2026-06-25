"use client";

import { useCallback, useMemo, useState } from "react";

import { ContentEditor } from "@/components/content-editor/ContentEditor";
import { DashboardIcon } from "@/components/dashboard/icons";
import {
  AppDropdownMenu,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuSeparator,
} from "@/components/primitives/AppDropdownMenu";
import { AppButton } from "@/components/primitives/AppButton";
import {
  dashboardContentCollections,
  dashboardContentLabels,
  type DashboardContentCollection,
} from "@/lib/dashboard/content/config";
import { createEmptyRichDocument } from "@/lib/rich-content/defaults";
import { formatWritingSaveStatusLabel } from "@/lib/dashboard/writing-save-status";
import type { WritingAssistAction } from "@/lib/agent/prompts/writing-assist";
import {
  runWritingWorkflowAction,
  type WritingWorkflowActionId,
} from "@/lib/dashboard/writing-workflow-actions";

import { useWritingAssist } from "./use-writing-assist";
import { canEditTitle, showsSummaryField } from "./writing-metadata";
import { WritingPublishDialog, type WritingPublishVisibility } from "./WritingPublishDialog";
import type { WritingDocument, WritingDraft, WritingSaveState } from "./writing-types";

type WritingEditorPaneProps = {
  document: null | WritingDocument;
  draft: WritingDraft | null;
  error: null | string;
  focusMode: boolean;
  isDirty: boolean;
  isLoadingDocument?: boolean;
  onCreateDocument?: (collection: DashboardContentCollection) => void;
  onFlushSave: () => Promise<null | WritingDocument>;
  onOpenInspector?: () => void;
  onPrefillComposer?: (prompt: string) => void;
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
  replaceSelection?: (result: string) => void;
  text?: string;
};

export function WritingEditorPane({
  document,
  draft,
  error,
  focusMode,
  isDirty,
  isLoadingDocument = false,
  onCreateDocument,
  onFlushSave,
  onOpenInspector,
  onPrefillComposer,
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
  const [workflowToast, setWorkflowToast] = useState<null | string>(null);

  const saveStatusLabel = useMemo(
    () => formatWritingSaveStatusLabel({ error, isDirty, saveState }),
    [error, isDirty, saveState],
  );

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

  const handleWorkflow = useCallback(
    (id: WritingWorkflowActionId) => {
      runWritingWorkflowAction(id, {
        onPrefillComposer: (prompt) => onPrefillComposer?.(prompt),
        onToast: (message) => {
          setWorkflowToast(message);
          window.setTimeout(() => setWorkflowToast(null), 3200);
        },
        onWritingAssist: (action) => void handleAssist(action),
      });
    },
    [handleAssist, onPrefillComposer],
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
      return null;
    }

    return {
      aiLoading,
      status: document.status,
      updatedLabel: formatRelativeUpdate(document.updatedAt),
      visibility: document.visibility,
    };
  }, [aiLoading, document]);

  if (isLoadingDocument) {
    return (
      <section aria-busy="true" aria-label="编辑器" className="sunny-writing-editor-pane">
        <div className="sunny-writing-editor-loading">
          <div className="sunny-writing-loading-line is-wide" />
          <div className="sunny-writing-loading-line" />
          <div className="sunny-writing-loading-line is-short" />
        </div>
      </section>
    );
  }

  if (!document || !draft) {
    return (
      <section className="sunny-writing-editor-pane" aria-label="编辑器">
        <div className="sunny-writing-empty-state">
          <p>{headerLabel}</p>
          <h2>输入标题，开始写作</h2>
          <p className="sunny-writing-side-muted">或从左侧内容库选择一篇文档。</p>
          {onCreateDocument ? (
            <div className="sunny-writing-empty-create-actions">
              {createOptions.map((option) => (
                <button
                  key={option.collection}
                  onClick={() => onCreateDocument(option.collection)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  }


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
          {!focusMode ? (
            <>
              <span
                aria-live="polite"
                className={`sunny-writing-save-state${isDirty ? " is-dirty" : ""}${saveState === "error" || error ? " is-error" : ""}`}
              >
                {saveStatusLabel}
              </span>
              <AppButton
                className="sunny-writing-topbar-preview"
                onClick={onTogglePreviewMode}
                variant="outline"
              >
                预览
              </AppButton>
              <AppButton
                className="sunny-writing-topbar-publish"
                onClick={openPublishDialog}
                variant="primary"
              >
                发布
              </AppButton>
              <AppDropdownMenu
                align="end"
                className="sunny-writing-menu sunny-writing-topbar-more-menu"
                side="bottom"
                sideOffset={6}
                trigger={<DashboardIcon name="moreHorizontal" />}
                triggerAriaLabel="更多操作"
                triggerClassName="sunny-writing-topbar-more-trigger"
                triggerTitle="更多操作"
              >
                {onCreateDocument ? (
                  <>
                    <AppDropdownMenuLabel>新建文档</AppDropdownMenuLabel>
                    {createOptions.map((option) => (
                      <AppDropdownMenuItem
                        key={option.collection}
                        onSelect={() => onCreateDocument(option.collection)}
                      >
                        {option.label}
                      </AppDropdownMenuItem>
                    ))}
                    <AppDropdownMenuSeparator />
                  </>
                ) : null}
                {document.publicHref ? (
                  <AppDropdownMenuItem
                    onSelect={() => {
                      if (document.publicHref) {
                        void navigator.clipboard?.writeText(document.publicHref);
                      }
                    }}
                  >
                    复制链接
                  </AppDropdownMenuItem>
                ) : null}
                <AppDropdownMenuItem disabled>移动到</AppDropdownMenuItem>
                <AppDropdownMenuItem disabled>导出</AppDropdownMenuItem>
                <AppDropdownMenuItem className="is-danger" disabled>
                  删除
                </AppDropdownMenuItem>
                <AppDropdownMenuSeparator />
                <AppDropdownMenuItem onSelect={onToggleFocusMode}>专注写作</AppDropdownMenuItem>
                {onOpenInspector ? (
                  <AppDropdownMenuItem onSelect={onOpenInspector}>打开属性</AppDropdownMenuItem>
                ) : null}
              </AppDropdownMenu>
            </>
          ) : null}
        </div>
      </div>

      {workflowToast ? (
        <p className="sunny-writing-workflow-toast" role="status">
          {workflowToast}
        </p>
      ) : null}
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

          <p className="sunny-writing-document-byline">
            {documentByline ? (
              <>
                <span>{`更新于 ${documentByline.updatedLabel}`}</span>
                <span aria-hidden className="sunny-writing-byline-sep">
                  {" "}
                  ·{" "}
                </span>
                {documentByline.status === "draft" ? (
                  <span className="sunny-writing-byline-chip">草稿</span>
                ) : (
                  <span>已发布</span>
                )}
                <span aria-hidden className="sunny-writing-byline-sep">
                  {" "}
                  ·{" "}
                </span>
                <span>{documentByline.visibility === "public" ? "公开" : "仅自己可见"}</span>
                {documentByline.aiLoading ? (
                  <>
                    <span aria-hidden className="sunny-writing-byline-sep">
                      {" "}
                      ·{" "}
                    </span>
                    <span>AI 处理中</span>
                  </>
                ) : null}
              </>
            ) : null}
          </p>

          {showsSummaryField(document.collection) ? (
            <div className="sunny-writing-summary-row">
              <textarea
                aria-label="摘要"
                className="sunny-writing-summary-input"
                onChange={(event) => onUpdateDraft({ summary: event.target.value })}
                placeholder="写一句摘要，帮助自己快速理解这篇内容..."
                rows={1}
                value={draft.summary}
              />
            </div>
          ) : null}
        </div>

        <ContentEditor
          key={`${document.collection}:${document.id}`}
          autoFocus
          className="sunny-writing-tiptap-editor"
          content={draft.contentRich ?? createEmptyRichDocument()}
          disabled={saveState === "saving"}
          onChange={(contentRich) => onUpdateDraft({ contentRich })}
          onWritingAssist={(action) => void handleAssist(action)}
          onWorkflowAction={handleWorkflow}
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
