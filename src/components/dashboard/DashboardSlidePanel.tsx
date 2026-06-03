"use client";

import { useCallback, useRef, useState } from "react";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import { AgentTaskRow } from "@/components/dashboard/agent/AgentTaskRow";
import { riskLevelLabelMap } from "@/components/dashboard/agent/constants";
import type { AgentRunSummary, AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";

type UnifiedTask = {
  id: string;
  label: string;
  prompt: string;
  reason: string;
  riskLevel?: "high" | "low" | "medium";
  source?: string;
  suggestion?: AgentInboxSuggestion;
};

type DashboardSlidePanelProps = {
  disabled?: boolean;
  isThinking: boolean;
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onSearchThreads?: (query: string) => void;
  onSelectRun?: (runId: number) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  selectedRunId?: null | number;
  statusLabel: string;
  suggestions: AgentInboxSuggestion[];
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function DashboardSlidePanel({
  disabled,
  isThinking,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onRunPrompt,
  onSearchThreads,
  onSelectRun,
  onRunSuggestion,
  pendingAction,
  quickPrompts,
  recentRuns,
  selectedRunId,
  statusLabel,
  suggestions,
  threadId,
  threads,
}: DashboardSlidePanelProps) {
  const [threadSearch, setThreadSearch] = useState("");
  const [showAllThreads, setShowAllThreads] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (value: string) => {
      setThreadSearch(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchThreads?.(value);
      }, 300);
    },
    [onSearchThreads],
  );

  // Convert suggestions + quick prompts into unified "建议" list
  const suggestionTasks = suggestions.slice(0, 3).map((s) => ({
    id: `inbox-${s.id}`,
    label: s.title,
    prompt: s.suggestedPrompt,
    reason: s.reason,
    riskLevel: s.riskLevel,
    source: s.source,
    suggestion: s,
  }));
  const quickTasks = quickPrompts.slice(0, 2).map((p) => ({
    id: `quick-${p.prompt}`,
    label: p.label,
    prompt: p.prompt,
    reason: p.prompt,
  }));
  const allTasks: UnifiedTask[] = [...suggestionTasks, ...quickTasks];

  const visibleThreads = showAllThreads ? threads : threads.slice(0, 8);

  // Helper: determine tone for pending action
  function getPendingTone(pa: PendingAction) {
    if (pa.type === "await_confirmation") {
      return pa.action.riskLevel === "high" ? "danger" as const
        : pa.action.riskLevel === "medium" ? "warning" as const
        : "success" as const;
    }
    return "warning" as const;
  }

  // Helper: determine tone + meta for run
  function getRunTone(run: AgentRunSummary) {
    if (run.status === "failed") return "danger" as const;
    if (run.runKind === "rollback") return "warning" as const;
    return run.status === "succeeded" ? "success" as const : "info" as const;
  }

  function getRunMeta(run: AgentRunSummary) {
    if (run.runKind === "rollback") return "回滚";
    if (run.runKind === "review") return "复盘";
    return run.status === "succeeded" ? "成功" : run.status === "failed" ? "失败" : run.status;
  }

  return (
    <aside className="sunny-dashboard-slide-panel" aria-label="Agent 面板">
      {/* Header */}
      <div className="sunny-dashboard-slide-panel-head">
        <span>Agent 会话</span>
        <button
          type="button"
          className="sunny-dashboard-slide-panel-new-btn"
          onClick={onNewThread}
          title="新建会话"
          aria-label="新建会话"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="sunny-dashboard-slide-panel-search">
        <input
          type="text"
          value={threadSearch}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="搜索会话..."
          aria-label="搜索会话"
        />
      </div>

      {/* Body */}
      <div className="sunny-dashboard-slide-panel-body">

        {/* Current task status */}
        <div className="sunny-dashboard-slide-section-label">当前任务</div>
        <AgentTaskRow
          detail={isThinking ? "运行中" : "就绪"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />

        {/* Pending action */}
        {pendingAction ? (
          <>
            <div className="sunny-dashboard-slide-section-label">待确认</div>
            <AgentTaskRow
              detail={getPendingActionLabel(pendingAction)}
              label={
                pendingAction.type === "await_confirmation"
                  ? pendingAction.action.summary
                  : pendingAction.type === "await_queue_resume"
                    ? "延迟队列可继续"
                    : "需要继续输入"
              }
              meta="待处理"
              tone={getPendingTone(pendingAction)}
            />
          </>
        ) : null}

        {/* Suggestions */}
        <div className="sunny-dashboard-slide-section-label">建议</div>
        {allTasks.length > 0 ? (
          allTasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              disabled={disabled}
              detail={task.reason}
              label={task.label}
              meta={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "建议"}
              onClick={() => {
                if (task.suggestion) {
                  onRunSuggestion(task.suggestion);
                  return;
                }
                onRunPrompt(task.prompt);
              }}
              tone={
                task.riskLevel === "high" ? "danger"
                  : task.riskLevel === "medium" ? "warning"
                  : "accent"
              }
            />
          ))
        ) : (
          <AgentTaskRow detail="输入目标即可开始" label="暂无建议" tone="muted" />
        )}

        {/* Thread list */}
        <div className="sunny-dashboard-slide-section-label">会话</div>
        {visibleThreads.map((thread) => (
          <AgentTaskRow
            key={thread.id}
            detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
            label={thread.title || `会话 #${thread.id}`}
            meta={thread.archived ? "归档" : thread.tags?.length ? thread.tags[0] : `#${thread.id}`}
            onClick={() => onLoadThread(thread.id)}
            selected={thread.id === threadId}
            tone={thread.archived ? "muted" : thread.pendingAction ? "warning" : "muted"}
          />
        ))}
        {!showAllThreads && threads.length > 8 ? (
          <button
            type="button"
            style={{
              width: "100%",
              padding: "0.3rem",
              border: "none",
              background: "transparent",
              color: "var(--muted)",
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
            onClick={() => setShowAllThreads(true)}
          >
            显示全部 ({threads.length})
          </button>
        ) : null}
        {threads.length === 0 ? (
          <AgentTaskRow
            detail={threadSearch ? "没有匹配的会话" : "还没有历史会话"}
            label={threadSearch ? "未找到" : "暂无会话"}
            tone="muted"
          />
        ) : null}

        {/* Recent runs */}
        <div className="sunny-dashboard-slide-section-label">最近</div>
        {recentRuns.slice(0, 4).map((run) => (
          <AgentTaskRow
            key={run.id}
            detail={run.impactSummary ?? run.summary ?? run.workflow}
            label={run.title}
            meta={getRunMeta(run)}
            onClick={onSelectRun ? () => onSelectRun(run.id) : undefined}
            selected={run.id === selectedRunId}
            tone={getRunTone(run)}
          />
        ))}
        {recentRuns.length === 0 ? (
          <AgentTaskRow detail="还没有审计记录" label="暂无记录" tone="muted" />
        ) : null}
      </div>
    </aside>
  );
}
