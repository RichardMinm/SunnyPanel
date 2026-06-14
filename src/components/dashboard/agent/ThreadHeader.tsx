"use client";

import { useCallback, useRef, useState } from "react";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";

import { getPendingActionLabel } from "./utils";
import { DashboardIcon } from "../icons";

type ThreadHeaderProps = {
  debugMode: boolean;
  displayTitle: string;
  isSubmitting: boolean;
  onArchiveThread?: () => void;
  onDebugModeChange: (next: boolean) => void;
  onOpenDetails: () => void;
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;
  statusLabel: string;
  threadId: null | number;
  workbenchMode: AgentWorkbenchMode;
};

const MODE_LABEL: Record<AgentWorkbenchMode, string> = {
  ask: "自动模式",
  answer: "只回答",
  execute: "执行模式",
  plan: "规划模式",
  review: "回顾模式",
  timeline: "时间线模式",
  today: "今日模式",
  writing: "写作模式",
};

function getSummaryStatus(isSubmitting: boolean, statusLabel: string, pendingAction: null | PendingAction): string {
  if (isSubmitting) {
    return "执行中";
  }
  if (pendingAction) {
    return getPendingActionLabel(pendingAction);
  }
  return statusLabel || "已就绪";
}

export function ThreadHeader({
  debugMode,
  displayTitle,
  isSubmitting,
  onArchiveThread,
  onDebugModeChange,
  onOpenDetails,
  onRenameThread,
  pendingAction,
  statusLabel,
  threadId,
  workbenchMode,
}: ThreadHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);
  const [saving, setSaving] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const metaParts = [
    threadId ? `Thread #${threadId}` : null,
    getSummaryStatus(isSubmitting, statusLabel, pendingAction),
    MODE_LABEL[workbenchMode],
  ].filter(Boolean);

  const startEditing = useCallback(() => {
    setDraftTitle(displayTitle);
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [displayTitle]);

  const saveTitle = useCallback(async () => {
    const trimmed = draftTitle.trim();
    if (!trimmed || trimmed === displayTitle) {
      setEditing(false);
      return;
    }
    setSaving(true);
    const ok = await onRenameThread(trimmed);
    setSaving(false);
    if (ok) setEditing(false);
  }, [draftTitle, displayTitle, onRenameThread]);

  const cancelEditing = useCallback(() => {
    setDraftTitle(displayTitle);
    setEditing(false);
  }, [displayTitle]);

  return (
    <div className="sunny-agent-thread-header">
      <div className="sunny-agent-thread-header-top">
        <p>AGENT 会话</p>
        <div className="sunny-agent-thread-header-actions" aria-label="Thread 操作">
          <button
            type="button"
            className={`sunny-agent-thread-header-icon-button${debugMode ? " is-active" : ""}`}
            aria-pressed={debugMode}
            aria-label="调试"
            title={debugMode ? "关闭调试" : "开启调试"}
            onClick={() => onDebugModeChange(!debugMode)}
          >
            <DashboardIcon name="debug" />
          </button>
          <button
            type="button"
            className="sunny-agent-thread-header-icon-button"
            aria-label="查看详情"
            title="查看详情"
            onClick={onOpenDetails}
          >
            <DashboardIcon name="inspectorPanel" />
          </button>
          {onArchiveThread && threadId !== null ? (
            <button
              type="button"
              className="sunny-agent-thread-header-icon-button"
              aria-label="归档会话"
              title="归档会话"
              onClick={() => setArchiveConfirmOpen(true)}
            >
              <DashboardIcon name="archive" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="sunny-agent-thread-header-title">
        {editing ? (
          <input
            ref={inputRef}
            className="sunny-agent-thread-header-title-input"
            disabled={saving}
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") cancelEditing();
            }}
          />
        ) : (
          <button
            type="button"
            className="sunny-agent-thread-header-title-text"
            onClick={startEditing}
            title="点击重命名会话"
          >
            {displayTitle || "新会话"}
          </button>
        )}
      </div>
      {metaParts.length > 0 ? (
        <p className="sunny-agent-thread-header-meta">
          {metaParts.join(" · ")}
        </p>
      ) : null}
      {archiveConfirmOpen && (
        <div
          className="sunny-confirm-overlay"
          onClick={() => setArchiveConfirmOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="确认归档"
        >
          <div
            className="sunny-confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="sunny-confirm-title">确认归档</p>
            <p className="sunny-confirm-message">
              归档后可在「已归档」区找回。确定归档会话「{displayTitle}」？
            </p>
            <div className="sunny-confirm-actions">
              <button
                type="button"
                className="sunny-confirm-btn-cancel"
                onClick={() => setArchiveConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="sunny-confirm-btn-warning"
                onClick={() => {
                  setArchiveConfirmOpen(false);
                  onArchiveThread?.();
                }}
              >
                确认归档
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
