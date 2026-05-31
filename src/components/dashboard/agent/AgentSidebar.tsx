import { useCallback, useState } from "react";

import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

import { riskLevelLabelMap } from "./constants";
import { AgentTaskRow } from "./AgentTaskRow";
import type { AgentRunSummary, AgentThreadSummary } from "./types";
import { buildSuggestedTasks, getPendingActionLabel } from "./utils";
import Link from "next/link";
import { workspaceNavSections } from "@/components/dashboard/nav/dashboard-nav-items";

type AgentSidebarProps = {
  disabled?: boolean;
  inboxSuggestions: AgentInboxSuggestion[];
  isThinking: boolean;
  onArchiveThread?: (threadId: number, archived: boolean) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onRunPrompt: (prompt: string) => void;
  onRunSuggestion: (suggestion: AgentInboxSuggestion) => void;
  onSearchThreads?: (query: string) => void;
  pendingAction: null | PendingAction;
  quickPrompts: AgentQuickPrompt[];
  recentRuns: AgentRunSummary[];
  statusLabel: string;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function AgentSidebar({
  disabled,
  inboxSuggestions,
  isThinking,
  onArchiveThread,
  onLoadThread,
  onNewThread,
  onRunPrompt,
  onRunSuggestion,
  onSearchThreads,
  pendingAction,
  quickPrompts,
  recentRuns,
  statusLabel,
  threadId,
  threads,
}: AgentSidebarProps) {
  const [threadSearch, setThreadSearch] = useState("");
  const [showAllThreads, setShowAllThreads] = useState(false);

  const handleSearchChange = useCallback(
    (value: string) => {
      setThreadSearch(value);
      onSearchThreads?.(value);
    },
    [onSearchThreads],
  );

  const visibleThreads = showAllThreads ? threads : threads.slice(0, 8);
  const tasks = buildSuggestedTasks(inboxSuggestions, quickPrompts).slice(0, 5);
  const pendingTone = pendingAction?.type === "await_confirmation"
    ? pendingAction.action.riskLevel === "high"
      ? "danger"
      : pendingAction.action.riskLevel === "medium"
        ? "warning"
        : "success"
    : "warning";

  return (
    <aside className="sunny-agent-left-rail">
      <div className="sunny-agent-rail-head">
        <button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
          + 新建 Thread
        </button>
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">当前任务</p>
        <AgentTaskRow
          detail={isThinking ? "运行中" : "就绪"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">待确认</p>
        {pendingAction ? (
          <AgentTaskRow
            detail={getPendingActionLabel(pendingAction)}
            label={pendingAction.type === "await_confirmation" ? pendingAction.action.summary : "需要继续输入"}
            meta="待处理"
            tone={pendingTone}
          />
        ) : (
          <AgentTaskRow detail="没有待确认动作" label="无待办" tone="muted" />
        )}
      </div>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">建议</p>
        {tasks.length > 0 ? (
          tasks.map((task) => (
            <AgentTaskRow
              key={task.id}
              disabled={disabled}
              detail={task.reason}
              label={task.label}
              meta={task.riskLevel ? riskLevelLabelMap[task.riskLevel] : task.source ?? "Run"}
              onClick={() => {
                if (task.suggestion) {
                  onRunSuggestion(task.suggestion);
                  return;
                }

                onRunPrompt(task.prompt);
              }}
              tone={task.riskLevel === "high" ? "danger" : task.riskLevel === "medium" ? "warning" : "accent"}
            />
          ))
        ) : (
          <AgentTaskRow detail="输入一个目标即可开始" label="暂无建议" tone="muted" />
        )}
      </div>

      {workspaceNavSections.map((section) => (
        <details key={section.id} className="sunny-agent-rail-section sunny-agent-rail-details" open>
          <summary>{section.label}</summary>
          <div className="sunny-agent-rail-detail-list">
            {section.items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="sunny-agent-nav-item"
              >
                <AgentTaskRow
                  detail={item.badge ? String(item.badge) : undefined}
                  label={item.label}
                  tone="muted"
                />
              </Link>
            ))}
          </div>
        </details>
      ))}

      <details className="sunny-agent-rail-section sunny-agent-rail-details" open>
        <summary>会话列表</summary>
        <div className="sunny-agent-thread-search">
          <input
            type="text"
            value={threadSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索会话..."
            className="sunny-agent-thread-search-input"
            aria-label="搜索 Agent 会话"
          />
        </div>
        <div className="sunny-agent-rail-detail-list">
          {visibleThreads.map((thread) => (
            <div key={thread.id} className="sunny-agent-thread-row-wrapper">
              <AgentTaskRow
                detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
                label={`Thread #${thread.id}`}
                meta={thread.archived ? "归档" : thread.tags?.length ? thread.tags[0] : undefined}
                onClick={() => onLoadThread(thread.id)}
                selected={thread.id === threadId}
                tone={thread.archived ? "muted" : thread.pendingAction ? "warning" : "muted"}
              />
              {onArchiveThread ? (
                <button
                  type="button"
                  className="sunny-agent-thread-archive-btn"
                  title={thread.archived ? "取消归档" : "归档"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchiveThread(thread.id, !thread.archived);
                  }}
                >
                  {thread.archived ? "恢复" : "归档"}
                </button>
              ) : null}
            </div>
          ))}
          {!showAllThreads && threads.length > 8 ? (
            <button
              type="button"
              className="sunny-agent-thread-show-more"
              onClick={() => setShowAllThreads(true)}
            >
              显示全部 ({threads.length})
            </button>
          ) : null}
          {threads.length === 0 ? (
            <AgentTaskRow
              detail={threadSearch ? "没有匹配的会话" : "还没有历史会话"}
              label={threadSearch ? "未找到" : "No threads"}
              tone="muted"
            />
          ) : null}
        </div>
      </details>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>Recent AgentRuns</summary>
        <div className="sunny-agent-rail-detail-list">
          {recentRuns.slice(0, 4).map((run) => (
            <AgentTaskRow
              key={run.id}
              detail={run.summary ?? run.workflow}
              label={run.title}
              meta={run.status}
              tone={run.status === "failed" ? "danger" : run.status === "succeeded" ? "success" : "info"}
            />
          ))}
          {recentRuns.length === 0 ? <AgentTaskRow detail="还没有审计记录" label="No runs" tone="muted" /> : null}
        </div>
      </details>
    </aside>
  );
}
