"use client";

import { useCallback, useRef, useState } from "react";

import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentTokenUsage } from "@/lib/agent/schemas";

type ThreadHeaderProps = {
  displayTitle: string;
  isSubmitting: boolean;
  lastInteractionAt: null | string;
  onRenameThread: (title: string) => Promise<boolean>;
  pendingAction: null | PendingAction;
  threadId: null | number;
  tokenUsage: AgentTokenUsage;
};

type BadgeVariant = "ready" | "risky" | "running" | "waiting";

const BADGE_LABEL: Record<BadgeVariant, string> = {
  ready: "已就绪",
  risky: "有风险",
  running: "执行中",
  waiting: "等待确认",
};

const HIGH_RISK_INTENTS = [
  "add_completion_note",
  "append_plan_item",
  "cancel_schedule_item",
  "complete_plan_item",
  "compose_plan",
  "compose_schedule_item",
  "compose_timeline_event",
  "create_plan",
  "reschedule_item",
  "save_memory",
  "schedule_plan",
];

function isRiskyAction(pa: PendingAction): boolean {
  if (pa.type === "await_confirmation") {
    return pa.action.riskLevel === "high";
  }
  if (pa.type === "await_batch_confirmation") {
    return pa.actions.some((a) => a.riskLevel === "high");
  }
  if ("intent" in pa && typeof pa.intent === "string") {
    return HIGH_RISK_INTENTS.includes(pa.intent);
  }
  return pa.type === "await_completion_note";
}

function deriveBadgeVariant(
  isSubmitting: boolean,
  pendingAction: null | PendingAction,
): BadgeVariant {
  if (isSubmitting) return "running";
  if (!pendingAction) return "ready";
  return isRiskyAction(pendingAction) ? "risky" : "waiting";
}

function formatRelativeTime(iso: null | string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

function formatTokenCount(usage: AgentTokenUsage): string {
  const total = usage.totalTokens;
  if (total <= 0) return "";
  const k = Math.round(total / 100) / 10;
  return `${k}k tokens`;
}

export function ThreadHeader({
  displayTitle,
  isSubmitting,
  lastInteractionAt,
  onRenameThread,
  pendingAction,
  threadId,
  tokenUsage,
}: ThreadHeaderProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(displayTitle);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const variant = deriveBadgeVariant(isSubmitting, pendingAction);
  const metaParts = [
    threadId ? `Thread #${threadId}` : null,
    formatRelativeTime(lastInteractionAt),
    formatTokenCount(tokenUsage),
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
        <span className={`sunny-agent-badge sunny-agent-badge-${variant}`}>
          {BADGE_LABEL[variant]}
        </span>
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
    </div>
  );
}
