"use client";

import { useCallback, useEffect, useRef } from "react";

import { canEditTitle, showsSummaryField } from "./writing-metadata";
import type { WritingDocument, WritingDraft } from "./writing-types";

export type WritingDocumentByline = {
  aiLoading: boolean;
  status: WritingDocument["status"];
  updatedLabel: string;
  visibility: WritingDocument["visibility"];
};

type WritingDocumentHeaderProps = {
  byline: WritingDocumentByline | null;
  document: WritingDocument;
  draft: WritingDraft;
  onFocusBody: () => void;
  onGenerateTitle: () => void;
  onUpdateDraft: (patch: Partial<WritingDraft>) => void;
};

export function WritingDocumentHeader({
  byline,
  document,
  draft,
  onFocusBody,
  onGenerateTitle,
  onUpdateDraft,
}: WritingDocumentHeaderProps) {
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const resizeSummary = useCallback((element: HTMLTextAreaElement) => {
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (summaryRef.current) {
      resizeSummary(summaryRef.current);
    }
  }, [draft.summary, resizeSummary]);

  return (
    <header className="sunny-writing-document-header">
      {canEditTitle(document) ? (
        <div className="sunny-writing-title-row">
          <input
            aria-label="标题"
            className="sunny-writing-title-input"
            onChange={(event) => onUpdateDraft({ title: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                onFocusBody();
              }
            }}
            placeholder="未命名"
            value={draft.title}
          />
          <button
            className="sunny-writing-title-ai-ghost"
            data-title-empty={!draft.title.trim() ? "true" : "false"}
            disabled={byline?.aiLoading}
            onClick={onGenerateTitle}
            type="button"
          >
            ✨ 生成标题
          </button>
        </div>
      ) : null}

      <p className="sunny-writing-document-byline">
        {byline ? (
          <>
            <span>{`更新于 ${byline.updatedLabel}`}</span>
            <span aria-hidden className="sunny-writing-byline-sep"> · </span>
            {byline.status === "draft" ? (
              <span className="sunny-writing-byline-chip">草稿</span>
            ) : byline.status === "archived" ? (
              <span className="sunny-writing-byline-chip">已归档</span>
            ) : (
              <span>已发布</span>
            )}
            <span aria-hidden className="sunny-writing-byline-sep"> · </span>
            <span>{byline.visibility === "public" ? "公开" : "仅自己可见"}</span>
            {byline.aiLoading ? (
              <>
                <span aria-hidden className="sunny-writing-byline-sep"> · </span>
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
            onChange={(event) => {
              resizeSummary(event.currentTarget);
              onUpdateDraft({ summary: event.target.value });
            }}
            onFocus={(event) => resizeSummary(event.currentTarget)}
            placeholder="写一句摘要，帮助自己快速理解这篇内容…"
            ref={summaryRef}
            rows={1}
            value={draft.summary}
          />
        </div>
      ) : null}
    </header>
  );
}
