"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";
import { filterDashboardThreads } from "@/lib/dashboard/filter-dashboard-threads";
import { AppButton } from "@/components/primitives/AppButton";
import { AppIconButton } from "@/components/primitives/AppIconButton";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { DashboardSettingsMenu } from "@/components/dashboard/DashboardSettingsMenu";
import { DashboardIcon, type DashboardIconName } from "./icons";
import { ThreadRowMenu } from "@/components/dashboard/agent/ThreadRowMenu";
import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
import { WritingLibraryRail } from "@/components/dashboard/writing/WritingLibraryRail";
import { WritingSidebarBottomRail } from "@/components/dashboard/writing/WritingSidebarBottomRail";

export type DashboardIconMode = "agent" | "checklist" | "memory" | "plans" | "schedule" | "timeline" | "today" | "writing";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
  prompt: string;
}> = [
  { key: "agent", label: "工作台", icon: "agent", prompt: "" },
  { key: "schedule", label: "日程", icon: "calendar", prompt: "帮我查看最近的日程安排" },
  { key: "memory", label: "记忆库", icon: "memory", prompt: "" },
  { key: "writing", label: "写作", icon: "pencil", prompt: "" },
  { key: "checklist", label: "清单", icon: "checklist", prompt: "" },
  { key: "timeline", label: "时间线", icon: "timeline", prompt: "" },
];

function formatThreadMeta(thread: AgentThreadSummary) {
  const state = thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : "已就绪";
  const tag = thread.tags?.[0];

  return [state, tag, `#${thread.id}`].filter(Boolean).join(" · ");
}

export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  hoverExpanded: boolean;
  onArchiveThread: (id: number) => Promise<boolean>;
  onDeleteThread: (id: number) => Promise<boolean>;
  onHoverExpandedChange: (expanded: boolean) => void;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onPinnedChange: (pinned: boolean) => void;
  pinned: boolean;
  threadId: null | number;
  threadListMode?: "compact" | "full" | "hidden";
  threads: AgentThreadSummary[];
};

export function DashboardIconBar({
  activeMode,
  hoverExpanded,
  onArchiveThread,
  onDeleteThread,
  onHoverExpandedChange,
  onModeChange,
  onLoadThread,
  onNewThread,
  onPinnedChange,
  pinned,
  threadId,
  threadListMode = "full",
  threads,
}: DashboardIconBarProps) {
  const { locale, palette } = useSitePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadsOpen, setThreadsOpen] = useState(threadListMode === "full");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveThreads, setArchiveThreads] = useState<AgentThreadSummary[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentThreadSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Auto-collapse: unpinned sidebar stays a 56px grid strip; hover expands in-grid
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navRef = useRef<HTMLElement | null>(null);

  // Cleanup collapse timer on unmount
  useEffect(() => () => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
  }, []);

  const stripCollapsed = !pinned;
  const isWritingMode = activeMode === "writing";
  const showSessionSidebar = activeMode === "agent";

  // Nav-only classes; shell layout classes live on AppShell to survive panel re-renders
  useEffect(() => {
    if (!navRef.current) return;
    navRef.current.classList.toggle("is-auto-collapsed", stripCollapsed && !hoverExpanded);
    navRef.current.classList.toggle("is-hover-expanded", stripCollapsed && hoverExpanded);
  }, [hoverExpanded, pinned, stripCollapsed]);

  // Hover handlers — in-grid push expand via DashboardShell → AppShell
  const handleSidebarMouseEnter = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    if (!pinned) {
      onHoverExpandedChange(true);
    }
  }, [onHoverExpandedChange, pinned]);

  const handleSidebarMouseLeave = useCallback(() => {
    if (pinned) return;
    collapseTimer.current = setTimeout(() => {
      onHoverExpandedChange(false);
    }, 300);
  }, [onHoverExpandedChange, pinned]);

  const handleTogglePin = useCallback(() => {
    onHoverExpandedChange(false);
    onPinnedChange(!pinned);
  }, [onHoverExpandedChange, onPinnedChange, pinned]);

  const filteredThreads = useMemo(
    () => filterDashboardThreads(threads, searchQuery),
    [threads, searchQuery],
  );
  const visibleThreads = useMemo(() => {
    const limit = threadListMode === "compact" ? 3 : 40;
    return filteredThreads.slice(0, limit);
  }, [filteredThreads, threadListMode]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync thread list openness with writing mode */
    setThreadsOpen(threadListMode === "full");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [threadListMode]);

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

  // 页面加载时预取归档数量，确保 (N) 立即显示
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- data fetching on mount */
    void fetchArchivedThreads();
    /* eslint-enable react-hooks/set-state-in-effect */
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

  return (
    <nav
      ref={navRef}
      className={`sunny-dashboard-icon-bar sunny-sidebar-nav sunny-dashboard-sidebar${isWritingMode ? " is-writing-mode" : ""}`}
      aria-label="工作台导航"
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      <div className="sunny-dashboard-sidebar-top">
        <div className="sunny-dashboard-sidebar-brand-row">
          <Link
            href="/dashboard"
            className="sunny-dashboard-project-row"
            title="SunnyPanel"
            aria-label="SunnyPanel 首页"
          >
            <span className="sunny-dashboard-project-mark">S</span>
            <span>SunnyPanel</span>
          </Link>
          <AppIconButton
            aria-label={pinned ? "取消固定侧边栏" : "固定侧边栏"}
            className={`sunny-sidebar-pin-button is-square${pinned ? " is-pinned" : ""}`}
            icon={<DashboardIcon name="pin" />}
            onClick={handleTogglePin}
            size="sm"
            tooltip={pinned ? "取消固定侧边栏" : "固定侧边栏"}
          />
        </div>

        {!isWritingMode ? (
          <>
        <section className="sunny-dashboard-sidebar-section" aria-label="主操作">
          <p>主操作</p>
          <div className="sunny-dashboard-sidebar-actions">
            <AppButton
              aria-label="新对话"
              className="sunny-dashboard-sidebar-action"
              onClick={onNewThread}
              variant="ghost"
            >
              <span className="sunny-dashboard-sidebar-icon"><DashboardIcon name="new" /></span>
              <span className="sunny-dashboard-sidebar-label">新对话</span>
            </AppButton>
          </div>
        </section>

        {showSessionSidebar ? (
          <div className="sunny-dashboard-sidebar-search">
            <div className="sunny-dashboard-search-wrapper">
              <input
                type="text"
                className="sunny-dashboard-sidebar-search-input"
                placeholder="搜索会话..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                aria-label="搜索会话"
              />
              {searchQuery ? (
                <AppIconButton
                  aria-label="清除搜索"
                  className="sunny-dashboard-sidebar-search-clear"
                  icon="×"
                  onClick={clearSearch}
                  size="sm"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <section className="sunny-dashboard-sidebar-section" aria-label="项目">
          <p>项目</p>
          <div className="sunny-dashboard-project-row is-static">
            <span className="sunny-dashboard-sidebar-icon sunny-dashboard-project-icon"><DashboardIcon name="project" /></span>
            <span>SunnyPanel</span>
          </div>
        </section>
          </>
        ) : null}

        <section className="sunny-dashboard-sidebar-section" aria-label="工作区">
          <p>工作区</p>
          <div className="sunny-dashboard-mode-list">
            {DASHBOARD_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={`sunny-dashboard-mode-row${mode.key === activeMode ? " is-active" : ""}`}
                aria-current={mode.key === activeMode ? "true" : undefined}
                onClick={() => onModeChange(mode.key, mode.prompt)}
              >
                <span className="sunny-dashboard-sidebar-icon"><DashboardIcon name={mode.icon} /></span>
                <span className="sunny-dashboard-sidebar-label">{mode.label}</span>
              </button>
            ))}
          </div>
        </section>

        {isWritingMode ? <WritingLibraryRail /> : null}

        {showSessionSidebar ? (
          <>
        <section
          className={`sunny-dashboard-sidebar-section sunny-dashboard-thread-section${threadsOpen ? "" : " is-collapsed"}${threadListMode === "compact" ? " is-compact" : ""}`}
          aria-label="会话"
        >
          <button
            type="button"
            className="sunny-dashboard-sidebar-collapse-toggle"
            onClick={() => setThreadsOpen((v) => !v)}
            aria-expanded={threadsOpen}
          >
            <span className="sunny-sidebar-fold-arrow" data-open={threadsOpen}>
              <DashboardIcon name="chevronDown" />
            </span>
            <span className="sunny-dashboard-sidebar-icon"><DashboardIcon name="agent" /></span>
            会话 ({filteredThreads.length})
          </button>
          {threadsOpen ? (
            <div className="sunny-dashboard-thread-list" role="list">
              {visibleThreads.length > 0 ? (
                visibleThreads.map((thread) => (
                  <div
                    key={thread.id}
                    className={`sunny-dashboard-thread-row${thread.id === threadId ? " is-active" : ""}`}
                  >
                    <button
                      type="button"
                      className="sunny-dashboard-thread-row-btn"
                      onClick={() => onLoadThread(thread.id)}
                    >
                      <span>{thread.title || `会话 #${thread.id}`}</span>
                      <small>{formatThreadMeta(thread)}</small>
                    </button>
                    <ThreadRowMenu
                      threadId={thread.id}
                      threadTitle={thread.title || `会话 #${thread.id}`}
                      onArchive={handleArchive}
                    />
                  </div>
                ))
              ) : (
                <span className="sunny-dashboard-empty-label">暂无聊天</span>
              )}
              {threadListMode === "compact" && filteredThreads.length > 3 ? (
                <button
                  className="sunny-dashboard-thread-view-all"
                  onClick={() => onModeChange("agent", "")}
                  type="button"
                >
                  查看全部会话
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section
          className={`sunny-dashboard-sidebar-section sunny-dashboard-archive-section${archiveOpen ? "" : " is-collapsed"}`}
          aria-label="已归档"
        >
          <button
            type="button"
            className="sunny-dashboard-sidebar-collapse-toggle"
            onClick={loadArchivedThreads}
            aria-expanded={archiveOpen}
          >
            <span className="sunny-sidebar-fold-arrow" data-open={archiveOpen}>
              <DashboardIcon name="chevronDown" />
            </span>
            <span className="sunny-dashboard-sidebar-icon"><DashboardIcon name="archive" /></span>
            <span className="sunny-dashboard-sidebar-label">已归档{archiveLoaded ? ` (${archiveThreads.length})` : ""}</span>
          </button>
          {archiveOpen ? (
            archiveLoading ? (
              <span className="sunny-dashboard-empty-label">加载中...</span>
            ) : archiveThreads.length > 0 ? (
              <div className="sunny-dashboard-archive-list" role="list">
                {archiveThreads.map((thread) => (
                  <div key={thread.id} className="sunny-dashboard-archive-thread" role="listitem">
                    <span className="sunny-dashboard-sidebar-label">{thread.title || `会话 #${thread.id}`}</span>
                    <div className="sunny-dashboard-archive-actions">
                      <button
                        type="button"
                        className="sunny-dashboard-archive-restore-btn"
                        onClick={(e) => { e.stopPropagation(); void restoreThread(thread.id); }}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        className="sunny-dashboard-archive-delete-btn"
                        onClick={(e) => { e.stopPropagation(); setDeleteTarget(thread); }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className="sunny-dashboard-empty-label">没有已归档的会话</span>
            )
          ) : null}
        </section>
          </>
        ) : null}
      </div>

      <div className="sunny-dashboard-icon-bar-bottom sunny-dashboard-sidebar-bottom">
        {isWritingMode ? <WritingSidebarBottomRail /> : null}
        <div className="sunny-dashboard-sidebar-settings-row sunny-dashboard-settings">
          <DashboardSettingsMenu
            locale={locale}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            palette={palette}
            triggerClassName="sunny-dashboard-sidebar-action sunny-dashboard-sidebar-settings-trigger"
            trigger={
              <>
                <span className="sunny-dashboard-sidebar-icon"><DashboardIcon name="settings" /></span>
                <span className="sunny-dashboard-sidebar-label">设置</span>
              </>
            }
          />
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
