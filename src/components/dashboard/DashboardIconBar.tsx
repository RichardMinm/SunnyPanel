"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { AppIconButton } from "@/components/primitives/AppIconButton";
import { AppSearchInput } from "@/components/primitives/AppSearchInput";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { SidebarItem } from "@/components/layout/SidebarItem";
import { SidebarSection } from "@/components/layout/SidebarSection";
import { SidebarArchiveItem } from "@/components/dashboard/sidebar/SidebarArchiveItem";
import { SidebarCollapseToggle } from "@/components/dashboard/sidebar/SidebarCollapseToggle";
import { SidebarThreadItem } from "@/components/dashboard/sidebar/SidebarThreadItem";
import { formatThreadMeta } from "@/components/dashboard/sidebar/dashboard-sidebar-helpers";
import { DASHBOARD_MODES } from "@/components/dashboard/sidebar/dashboard-sidebar-modes";
import type { DashboardIconBarProps } from "@/components/dashboard/sidebar/dashboard-sidebar-types";
import { useDashboardSidebarSearch } from "@/components/dashboard/sidebar/use-dashboard-sidebar-search";
import { useDashboardSidebarThreads } from "@/components/dashboard/sidebar/use-dashboard-sidebar-threads";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { DashboardSettingsMenu } from "@/components/dashboard/DashboardSettingsMenu";
import { DashboardIcon } from "./icons";
import { ThreadRowMenu } from "@/components/dashboard/agent/ThreadRowMenu";
import { ConfirmDialog } from "@/components/dashboard/agent/ConfirmDialog";
import { WritingLibraryRail } from "@/components/dashboard/writing/WritingLibraryRail";
import { WritingSidebarBottomRail } from "@/components/dashboard/writing/WritingSidebarBottomRail";

export type { DashboardIconMode } from "@/components/dashboard/sidebar/dashboard-sidebar-types";
export type { DashboardIconBarProps } from "@/components/dashboard/sidebar/dashboard-sidebar-types";
export { DASHBOARD_MODES } from "@/components/dashboard/sidebar/dashboard-sidebar-modes";

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
  const {
    searchQuery,
    handleSearchChange,
    clearSearch,
    handleSearchKeyDown,
  } = useDashboardSidebarSearch();
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
  const showSidebarTooltips = stripCollapsed && !hoverExpanded;

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

  const { filteredThreads, visibleThreads } = useDashboardSidebarThreads({
    threads,
    searchQuery,
    threadListMode,
  });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync thread list openness with writing mode */
    setThreadsOpen(threadListMode === "full");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [threadListMode]);

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

  const sidebarBottom = (
    <div className="sunny-dashboard-icon-bar-bottom sunny-dashboard-sidebar-bottom">
      {isWritingMode ? <WritingSidebarBottomRail /> : null}
      {!isWritingMode ? (
        <div className="sunny-dashboard-sidebar-settings-row sunny-dashboard-settings">
          <DashboardSettingsMenu
            locale={locale}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            palette={palette}
            triggerAsChild
            trigger={
              <SidebarItem
                className="sunny-dashboard-sidebar-action sunny-dashboard-sidebar-settings-trigger"
                icon={<DashboardIcon name="settings" />}
                label="设置"
                tooltip="设置"
                showTooltip={showSidebarTooltips}
              />
            }
          />
        </div>
      ) : null}
    </div>
  );

  return (
    <>
    <AppSidebar
      ref={navRef}
      className={`sunny-dashboard-icon-bar sunny-sidebar-nav sunny-dashboard-sidebar${isWritingMode ? " is-writing-mode" : ""}`}
      aria-label="工作台导航"
      bottom={sidebarBottom}
      onMouseEnter={handleSidebarMouseEnter}
      onMouseLeave={handleSidebarMouseLeave}
    >
      <div className="sunny-dashboard-sidebar-top">
        <div className="sunny-dashboard-sidebar-brand-row">
          <Link
            href="/dashboard"
            className="sunny-dashboard-project-row"
            title="返回 SunnyPanel 工作台首页"
            aria-label="返回 SunnyPanel 工作台首页"
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
        <SidebarSection
          aria-label="主操作"
          className="sunny-dashboard-sidebar-section"
          title="主操作"
        >
          <div className="sunny-dashboard-sidebar-actions">
            <SidebarItem
              className="sunny-dashboard-sidebar-action"
              icon={<DashboardIcon name="new" />}
              label="新对话"
              onClick={onNewThread}
              tooltip="新对话"
              showTooltip={showSidebarTooltips}
            />
          </div>
        </SidebarSection>

        {showSessionSidebar ? (
          <div className="sunny-dashboard-sidebar-search">
            <AppSearchInput
              aria-label="搜索会话"
              className="sunny-dashboard-search-wrapper"
              placeholder="搜索会话..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onClear={clearSearch}
              onKeyDown={handleSearchKeyDown}
            />
          </div>
        ) : null}

        <SidebarSection
          aria-label="项目"
          className="sunny-dashboard-sidebar-section"
          title="项目"
        >
          <div className="sunny-dashboard-project-row is-static">
            <span className="sunny-dashboard-sidebar-icon sunny-dashboard-project-icon"><DashboardIcon name="project" /></span>
            <span>SunnyPanel</span>
          </div>
        </SidebarSection>
          </>
        ) : null}

        <SidebarSection
          aria-label="工作区"
          className="sunny-dashboard-sidebar-section"
          title="工作区"
        >
          <div className="sunny-dashboard-mode-list">
            {DASHBOARD_MODES.map((mode) => (
              <SidebarItem
                key={mode.key}
                active={mode.key === activeMode}
                className={`sunny-dashboard-mode-row${mode.key === activeMode ? " is-active" : ""}`}
                icon={<DashboardIcon name={mode.icon} />}
                label={mode.label}
                onClick={() => onModeChange(mode.key, mode.prompt)}
                tooltip={mode.label}
                showTooltip={showSidebarTooltips}
              />
            ))}
          </div>
        </SidebarSection>

        {isWritingMode ? <WritingLibraryRail /> : null}

        {showSessionSidebar ? (
          <>
        <section
          className={`sunny-dashboard-sidebar-section sunny-dashboard-thread-section${threadsOpen ? "" : " is-collapsed"}${threadListMode === "compact" ? " is-compact" : ""}`}
          aria-label="会话"
        >
          <SidebarCollapseToggle
            expanded={threadsOpen}
            label="会话"
            count={filteredThreads.length}
            icon={<DashboardIcon name="agent" />}
            arrowIcon={<DashboardIcon name="chevronDown" />}
            onToggle={() => setThreadsOpen((v) => !v)}
          />
          {threadsOpen ? (
            <div className="sunny-dashboard-thread-list" role="list">
              {visibleThreads.length > 0 ? (
                visibleThreads.map((thread) => (
                  <SidebarThreadItem
                    key={thread.id}
                    id={thread.id}
                    active={thread.id === threadId}
                    title={thread.title || `会话 #${thread.id}`}
                    meta={formatThreadMeta(thread)}
                    onClick={() => onLoadThread(thread.id)}
                    menu={
                      <ThreadRowMenu
                        threadId={thread.id}
                        threadTitle={thread.title || `会话 #${thread.id}`}
                        onArchive={handleArchive}
                      />
                    }
                  />
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
          <SidebarCollapseToggle
            expanded={archiveOpen}
            label="已归档"
            count={archiveLoaded ? archiveThreads.length : undefined}
            icon={<DashboardIcon name="archive" />}
            arrowIcon={<DashboardIcon name="chevronDown" />}
            onToggle={loadArchivedThreads}
          />
          {archiveOpen ? (
            archiveLoading ? (
              <span className="sunny-dashboard-empty-label">加载中...</span>
            ) : archiveThreads.length > 0 ? (
              <div className="sunny-dashboard-archive-list" role="list">
                {archiveThreads.map((thread) => (
                  <SidebarArchiveItem
                    key={thread.id}
                    id={thread.id}
                    title={thread.title || `会话 #${thread.id}`}
                    onRestore={() => void restoreThread(thread.id)}
                    onDelete={() => setDeleteTarget(thread)}
                  />
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
    </AppSidebar>
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
    </>
  );
}
