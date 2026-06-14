"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";
import { filterDashboardThreads } from "@/lib/dashboard/filter-dashboard-threads";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { DashboardIcon, type DashboardIconName } from "./icons";
import { ThreadRowMenu } from "@/components/dashboard/agent/ThreadRowMenu";
import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
import { useDashboardMotion } from "./motion/dashboard-motion";

export type DashboardIconMode = "agent" | "checklist" | "memory" | "plans" | "schedule" | "timeline" | "today" | "writing";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
  prompt: string;
}> = [
  { key: "today", label: "工作台", icon: "agent", prompt: "" },
  { key: "agent", label: "Agent", icon: "agent", prompt: "" },
  { key: "schedule", label: "日程", icon: "schedule", prompt: "帮我查看最近的日程安排" },
  { key: "memory", label: "记忆库", icon: "memory", prompt: "" },
  { key: "checklist", label: "清单", icon: "checklist", prompt: "" },
  { key: "timeline", label: "时间线", icon: "timeline", prompt: "" },
];

function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return hours === 1 ? "今天" : `${hours}小时前`;
  if (days === 1) return "昨天";
  if (days < 7) return `${days}天前`;
  if (days < 30) return `${Math.floor(days / 7)}周前`;
  return new Date(isoString).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/** Only show time — no status text */
function formatThreadTime(thread: AgentThreadSummary): string {
  return formatRelativeTime(thread.lastInteractionAt);
}

/** Get status badge info for non-ready states only */
function getThreadStatusBadge(thread: AgentThreadSummary): { label: string; variant: "executing" | "warning" | "danger" } | null {
  if (!thread.pendingAction) return null;
  const label = getPendingActionLabel(thread.pendingAction);
  if (!label || label === "已就绪") return null;
  if (label === "执行中") return { label, variant: "executing" };
  if (label === "需要确认" || label === "待复核") return { label, variant: "warning" };
  if (label === "失败" || label === "异常") return { label, variant: "danger" };
  return { label, variant: "warning" };
}

export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  initialSuggestions: AgentInboxSuggestion[];
  onArchiveThread: (id: number) => Promise<boolean>;
  onDeleteThread: (id: number) => Promise<boolean>;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function DashboardIconBar({
  activeMode,
  initialSuggestions,
  onArchiveThread,
  onDeleteThread,
  onModeChange,
  onLoadThread,
  onNewThread,
  threadId,
  threads,
}: DashboardIconBarProps) {
  const { locale } = useSitePreferences();
  const { layoutTransition, prefersReducedMotion } = useDashboardMotion();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadsOpen, setThreadsOpen] = useState(true);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveThreads, setArchiveThreads] = useState<AgentThreadSummary[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<AgentInboxSuggestion[]>(initialSuggestions);
  const [deleteTarget, setDeleteTarget] = useState<AgentThreadSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isToday = activeMode === "today";
  const isAgent = activeMode === "agent";

  const refreshSuggestions = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/suggestions");
      if (res.ok) {
        const data = (await res.json()) as { suggestions: AgentInboxSuggestion[] };
        setSuggestions(data.suggestions ?? []);
      }
    } catch {
      // silent
    }
  }, []);

  const handleAcceptSuggestion = useCallback(
    async (suggestion: AgentInboxSuggestion) => {
      try {
        await fetch("/api/agent/suggestions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: suggestion.id, action: "accept" }),
        });
      } catch {
        // silent
      }
      onModeChange("agent", suggestion.suggestedPrompt ?? suggestion.title);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    },
    [onModeChange],
  );

  const handleDismissSuggestion = useCallback(async (id: number) => {
    try {
      await fetch("/api/agent/suggestions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "dismiss" }),
      });
    } catch {
      // silent
    }
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const filteredThreads = useMemo(
    () => filterDashboardThreads(threads, searchQuery),
    [threads, searchQuery],
  );

  /** 3 most recent threads for "today" mode */
  const recentThreads = useMemo(
    () =>
      [...threads]
        .sort(
          (a, b) =>
            new Date(b.lastInteractionAt ?? 0).getTime() -
            new Date(a.lastInteractionAt ?? 0).getTime(),
        )
        .slice(0, 3),
    [threads],
  );

  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && searchQuery.trim()) {
        // 本地过滤已生效，预留后端搜索
      }
    },
    [searchQuery],
  );

  const fetchArchivedThreads = useCallback(async () => {
    if (archiveLoaded) return;
    setArchiveLoading(true);
    try {
      const res = await fetch("/api/agent/thread?archived=true&limit=20");
      if (res.ok) {
        const data = (await res.json()) as { threads: AgentThreadSummary[] };
        setArchiveThreads(data.threads ?? []);
        setArchiveLoaded(true);
      }
    } catch {
      // 静默失败
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveLoaded]);

  useEffect(() => {
    void fetchArchivedThreads();
  }, [fetchArchivedThreads]);

  const loadArchivedThreads = useCallback(() => {
    setArchiveOpen((v) => !v);
  }, []);

  const restoreThread = useCallback(
    async (id: number) => {
      try {
        const res = await fetch("/api/agent/thread", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, archived: false }),
        });
        if (res.ok) {
          setArchiveThreads((prev) => prev.filter((t) => t.id !== id));
        }
      } catch {
        // 静默失败
      }
    },
    [],
  );

  const handleArchive = useCallback(
    async (id: number) => {
      const ok = await onArchiveThread(id);
      if (ok && id === threadId) {
        onNewThread();
      }
    },
    [onArchiveThread, onNewThread, threadId],
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);

    try {
      const ok = await onDeleteThread(deleteTarget.id);
      if (ok) {
        setArchiveThreads((prev) => prev.filter((t) => t.id !== deleteTarget.id));
        setDeleteTarget(null);
      } else {
        setDeleteError("删除失败，请稍后重试");
      }
    } catch {
      setDeleteError("网络错误，请重试");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleteTarget, onDeleteThread]);

  /* ── shared thread row renderer ── */
  const renderThreadRow = useCallback(
    (thread: AgentThreadSummary, showActive: boolean) => {
      const badge = getThreadStatusBadge(thread);
      return (
        <div
          key={thread.id}
          className={`sunny-codex-thread-row${showActive && thread.id === threadId ? " is-active" : ""}`}
        >
          <button
            type="button"
            className="sunny-codex-thread-row-btn"
            onClick={() => onLoadThread(thread.id)}
          >
            <span>{thread.title || "未命名会话"}</span>
            <small>
              {badge ? (
                <span className={`sunny-thread-status-badge is-${badge.variant}`}>{badge.label}</span>
              ) : null}
              {formatThreadTime(thread)}
            </small>
          </button>
          <ThreadRowMenu
            threadId={thread.id}
            threadTitle={thread.title || "未命名会话"}
            onArchive={handleArchive}
          />
        </div>
      );
    },
    [handleArchive, onLoadThread, threadId],
  );

  return (
    <nav className="sunny-dashboard-icon-bar sunny-sidebar-nav sunny-codex-sidebar" aria-label="工作台导航">
      <div className="sunny-codex-sidebar-top">
        <Link
          href="/dashboard"
          className="sunny-codex-project-row"
          title="SunnyPanel"
          aria-label="SunnyPanel 首页"
        >
          <span className="sunny-codex-project-mark">S</span>
          <span>SunnyPanel</span>
        </Link>

        <section className="sunny-codex-sidebar-section" aria-label="主操作">
          <p>主操作</p>
          <div className="sunny-codex-sidebar-actions">
            <button
              type="button"
              className="sunny-codex-sidebar-action"
              aria-label="新对话"
              onClick={onNewThread}
            >
              <span className="sunny-codex-sidebar-icon"><DashboardIcon name="new" /></span>
              <span className="sunny-codex-sidebar-label">新对话</span>
            </button>
          </div>
        </section>

        {/* Search — only in agent mode */}
        {isAgent && (
          <div className="sunny-codex-sidebar-search">
            <div className="sunny-codex-search-wrapper">
              <input
                type="text"
                className="sunny-codex-sidebar-search-input"
                placeholder="搜索会话..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-label="搜索会话"
              />
              {searchQuery ? (
                <button
                  type="button"
                  className="sunny-codex-sidebar-search-clear"
                  onClick={clearSearch}
                  aria-label="清除搜索"
                >
                  ×
                </button>
              ) : null}
            </div>
          </div>
        )}

        <section className="sunny-codex-sidebar-section" aria-label="项目">
          <p>项目</p>
          <div className="sunny-codex-project-row is-static">
            <span className="sunny-codex-sidebar-icon sunny-codex-project-icon"><DashboardIcon name="project" /></span>
            <span>SunnyPanel</span>
          </div>
        </section>

        <section className="sunny-codex-sidebar-section" aria-label="工作区">
          <p>工作区</p>
          <div className="sunny-codex-mode-list">
            {DASHBOARD_MODES.map((mode) => {
              const isActive = mode.key === activeMode;

              return (
                <button
                  key={mode.key}
                  type="button"
                  className={`sunny-codex-mode-row${isActive ? " is-active" : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onModeChange(mode.key, mode.prompt)}
                >
                  {isActive && !prefersReducedMotion ? (
                    <motion.span
                      className="sunny-codex-mode-pill"
                      layoutId="dashboard-mode-pill"
                      transition={layoutTransition}
                      aria-hidden
                    />
                  ) : isActive ? (
                    <span className="sunny-codex-mode-pill" aria-hidden />
                  ) : null}
                  <span className="sunny-codex-sidebar-icon"><DashboardIcon name={mode.icon} /></span>
                  <span className="sunny-codex-sidebar-label">{mode.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Suggestions — only in agent mode */}
        {isAgent && suggestions.length > 0 && (
          <section className="sunny-codex-sidebar-section" aria-label="建议">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <p>💡 建议 ({suggestions.length})</p>
              <button
                type="button"
                style={{ fontSize: "10px", padding: "1px 4px", background: "none", border: "none", color: "#888", cursor: "pointer" }}
                onClick={refreshSuggestions}
                aria-label="刷新建议"
              >
                刷新
              </button>
            </div>
            <div className="sunny-codex-mode-list">
              {suggestions.slice(0, 6).map((s) => (
                <div
                  key={s.id}
                  className="sunny-codex-mode-row"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
                >
                  <button
                    type="button"
                    style={{
                      background: "none", border: "none", color: "inherit",
                      cursor: "pointer", textAlign: "left", flex: 1,
                      fontSize: "11px", padding: "3px 6px",
                    }}
                    onClick={() => handleAcceptSuggestion(s)}
                  >
                    {s.title}
                  </button>
                  <span style={{ display: "flex", gap: "2px" }}>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#4ade80", cursor: "pointer", fontSize: "10px", padding: "2px 4px" }}
                      onClick={() => handleAcceptSuggestion(s)}
                      title="接受建议"
                      aria-label={`接受建议：${s.title}`}
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "10px", padding: "2px 4px" }}
                      onClick={() => handleDismissSuggestion(s.id)}
                      title="忽略建议"
                      aria-label={`忽略建议：${s.title}`}
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── today mode: 最近会话 (3 threads + view all) ── */}
        {isToday && (
          <section className="sunny-codex-sidebar-section sunny-codex-recent-section" aria-label="最近会话">
            <p className="sunny-codex-recent-header">最近会话</p>
            <div className="sunny-codex-thread-list" role="list">
              {recentThreads.length > 0 ? (
                recentThreads.map((thread) => renderThreadRow(thread, false))
              ) : (
                <span className="sunny-codex-empty-label">暂无会话</span>
              )}
            </div>
            <button
              type="button"
              className="sunny-codex-view-all"
              onClick={() => onModeChange("agent", "")}
            >
              查看全部 →
            </button>
          </section>
        )}

        {/* ── agent mode: 完整会话列表 ── */}
        {isAgent && (
          <section
            className={`sunny-codex-sidebar-section sunny-codex-thread-section${threadsOpen ? "" : " is-collapsed"}`}
            aria-label="会话"
          >
            <button
              type="button"
              className="sunny-codex-sidebar-collapse-toggle"
              onClick={() => setThreadsOpen((v) => !v)}
              aria-expanded={threadsOpen}
            >
              <span className={`sunny-codex-collapse-caret${threadsOpen ? " is-open" : ""}`} aria-hidden>▾</span>
              <span className="sunny-codex-sidebar-icon"><DashboardIcon name="agent" /></span>
              会话 ({filteredThreads.length})
            </button>
            <div
              className={`sunny-codex-collapsible-body is-thread${threadsOpen ? " is-open" : ""}`}
              aria-hidden={!threadsOpen}
            >
              <div className="sunny-codex-thread-list" role="list">
                {filteredThreads.length > 0 ? (
                  filteredThreads.map((thread) => renderThreadRow(thread, true))
                ) : (
                  <span className="sunny-codex-empty-label">暂无聊天</span>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Archive — only in agent mode */}
        {isAgent && (
          <section className="sunny-codex-sidebar-section sunny-codex-archive-section" aria-label="已归档" aria-expanded={archiveOpen}>
            <button
              type="button"
              className="sunny-codex-sidebar-collapse-toggle"
              onClick={loadArchivedThreads}
              aria-expanded={archiveOpen}
            >
              <span className={`sunny-codex-collapse-caret${archiveOpen ? " is-open" : ""}`} aria-hidden>▾</span>
              <span className="sunny-codex-sidebar-icon"><DashboardIcon name="archive" /></span> 已归档
              {archiveLoaded ? ` (${archiveThreads.length})` : ""}
            </button>
            <div
              className={`sunny-codex-collapsible-body is-archive${archiveOpen ? " is-open" : ""}`}
              aria-hidden={!archiveOpen}
            >
              {archiveLoading ? (
                <span className="sunny-codex-empty-label">加载中...</span>
              ) : archiveThreads.length > 0 ? (
                <div className="sunny-codex-archive-list" role="list">
                  {archiveThreads.map((thread) => (
                    <div key={thread.id} className="sunny-codex-archive-thread" role="listitem">
                      <div className="sunny-codex-archive-thread-content">
                        <span>{thread.title || "未命名会话"}</span>
                        <small>{formatThreadTime(thread)}</small>
                      </div>
                      <ThreadRowMenu
                        threadId={thread.id}
                        threadTitle={thread.title || "未命名会话"}
                        menuItems={[
                          {
                            label: "恢复",
                            onClick: () => { void restoreThread(thread.id); },
                          },
                          {
                            label: "删除",
                            danger: true,
                            onClick: () => setDeleteTarget(thread),
                          },
                        ]}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <span className="sunny-codex-empty-label">没有已归档的会话</span>
              )}
            </div>
          </section>
        )}
      </div>

      <div className="sunny-dashboard-icon-bar-bottom sunny-codex-sidebar-bottom">
        <div className="sunny-dashboard-settings">
          <button
            type="button"
            className="sunny-codex-sidebar-action"
            title="设置"
            aria-label="设置"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((value) => !value)}
          >
            <span className="sunny-codex-sidebar-icon"><DashboardIcon name="settings" /></span>
            <span className="sunny-codex-sidebar-label">设置</span>
          </button>
          {settingsOpen ? (
            <div className="sunny-dashboard-settings-popover" role="dialog" aria-label="设置">
              <p>主题</p>
              <ThemeToggle locale={locale} variant="admin" />
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="确认删除"
        message={
          deleteTarget
            ? `${deleteError ? `⚠️ ${deleteError} ` : ""}确定永久删除会话「${deleteTarget.title || `#${deleteTarget.id}`}」？此操作不可撤销。`
            : ""
        }
        confirmLabel="确认删除"
        variant="danger"
        busy={deleteBusy}
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
      />
    </nav>
  );
}
