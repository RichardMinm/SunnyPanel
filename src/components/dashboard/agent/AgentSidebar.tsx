import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { PendingAction } from "@/lib/agent/schemas";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";

import { riskLevelLabelMap } from "./constants";
import { AgentTaskRow } from "./AgentTaskRow";
import type { AgentRunSummary, AgentThreadSummary } from "./types";
import { buildSuggestedTasks, getPendingActionLabel } from "./utils";

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

const workspaceNav = [
  { href: "/dashboard", label: "总览" },
  { href: "/dashboard", label: "Agent" },
  { href: "/admin/collections/schedule-items", label: "今日" },
  { href: "/admin/collections/plans", label: "计划" },
  { href: "/admin/collections/schedule-items", label: "日程" },
  { href: "/admin/collections/posts", label: "写作" },
  { href: "/admin/collections/agent-memories", label: "记忆" },
] as const;

function getPendingTone(pendingAction: PendingAction | null) {
  if (pendingAction?.type === "await_confirmation") {
    return pendingAction.action.riskLevel === "high"
      ? "danger"
      : pendingAction.action.riskLevel === "medium"
        ? "warning"
        : "success";
  }

  return "warning";
}

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
  const pinnedItems = useMemo(() => {
    const tags = threads.flatMap((thread) => thread.tags ?? []).filter(Boolean);

    return Array.from(new Set(tags)).slice(0, 5);
  }, [threads]);
  const pendingTone = getPendingTone(pendingAction);

  return (
    <aside className="sunny-agent-left-rail" data-testid="agent-sidebar" aria-label="Agent 任务导航">
      <div className="sunny-agent-rail-head">
        <button type="button" onClick={onNewThread} className="sunny-agent-new-task-button">
          新建 Thread
        </button>
      </div>

      <nav className="sunny-agent-rail-section" data-testid="agent-workspace-nav" aria-label="工作台导航">
        <p className="sunny-agent-rail-label">工作台</p>
        <div className="sunny-agent-workspace-nav-list">
          {workspaceNav.map((item) => (
            <Link key={`${item.label}-${item.href}`} href={item.href} className="sunny-agent-nav-link">
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="sunny-agent-rail-section">
        <p className="sunny-agent-rail-label">当前任务</p>
        <AgentTaskRow
          detail={isThinking ? "运行中" : "就绪"}
          label={statusLabel}
          meta={threadId ? `#${threadId}` : null}
          tone={isThinking ? "info" : "success"}
        />
      </div>

      <div className="sunny-agent-rail-section" data-testid="agent-pending-list">
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

      <section className="sunny-agent-rail-section" data-testid="agent-thread-list" aria-label="Agent Threads">
        <div className="sunny-agent-rail-section-head">
          <p className="sunny-agent-rail-label">Agent Threads</p>
          <span>{threads.length}</span>
        </div>
        <div className="sunny-agent-thread-search">
          <input
            type="text"
            value={threadSearch}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder="搜索 Thread..."
            className="sunny-agent-thread-search-input"
            aria-label="搜索 Agent Thread"
          />
        </div>
        <div className="sunny-agent-rail-detail-list">
          {visibleThreads.map((thread) => (
            <div key={thread.id} className="sunny-agent-thread-row-wrapper">
              <AgentTaskRow
                detail={thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.title}
                label={thread.title || `Thread #${thread.id}`}
                meta={thread.archived ? "归档" : thread.tags?.length ? thread.tags[0] : `#${thread.id}`}
                onClick={() => onLoadThread(thread.id)}
                selected={thread.id === threadId}
                tone={thread.archived ? "muted" : thread.pendingAction ? "warning" : "muted"}
              />
              {onArchiveThread ? (
                <button
                  type="button"
                  className="sunny-agent-thread-archive-btn"
                  title={thread.archived ? "取消归档" : "归档"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onArchiveThread(thread.id, !thread.archived);
                  }}
                >
                  {thread.archived ? "恢复" : "归档"}
                </button>
              ) : null}
            </div>
          ))}
          {!showAllThreads && threads.length > 8 ? (
            <button type="button" className="sunny-agent-thread-show-more" onClick={() => setShowAllThreads(true)}>
              显示全部 ({threads.length})
            </button>
          ) : null}
          {threads.length === 0 ? (
            <AgentTaskRow
              detail={threadSearch ? "没有匹配的 Thread" : "还没有历史 Thread"}
              label={threadSearch ? "未找到" : "No threads"}
              tone="muted"
            />
          ) : null}
        </div>
      </section>

      <section className="sunny-agent-rail-section" data-testid="agent-pinned-list" aria-label="Pinned">
        <p className="sunny-agent-rail-label">Pinned</p>
        {pinnedItems.length > 0 ? (
          pinnedItems.map((tag) => <AgentTaskRow key={tag} detail="来自 Thread 标签" label={tag} tone="accent" />)
        ) : (
          <AgentTaskRow detail="后续可固定计划、项目和记忆" label="暂无固定对象" tone="muted" />
        )}
      </section>

      <details className="sunny-agent-rail-section sunny-agent-rail-details">
        <summary>最近执行</summary>
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
