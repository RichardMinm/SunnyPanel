"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";
import { filterDashboardThreads } from "@/lib/dashboard/filter-dashboard-threads";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";
import { DashboardIcon, type DashboardIconName } from "./icons";

export type DashboardIconMode = "agent" | "today" | "plans" | "schedule" | "writing" | "memory";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: DashboardIconName;
  prompt: string;
}> = [
  { key: "agent", label: "工作台", icon: "agent", prompt: "" },
  { key: "today", label: "今日", icon: "calendar", prompt: "帮我整理今天最应该推进的工作" },
  { key: "plans", label: "计划", icon: "plans", prompt: "帮我检查所有进行中计划的进度" },
  { key: "schedule", label: "日程", icon: "schedule", prompt: "帮我查看最近的日程安排" },
  { key: "writing", label: "写作", icon: "pencil", prompt: "帮我整理最近的写作素材" },
  { key: "memory", label: "记忆库", icon: "memory", prompt: "" },
];

function formatThreadMeta(thread: AgentThreadSummary) {
  const state = thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : "已就绪";
  const tag = thread.tags?.[0];

  return [state, tag, `#${thread.id}`].filter(Boolean).join(" · ");
}

export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  initialSuggestions: AgentInboxSuggestion[];
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onSearchClick?: () => void;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function DashboardIconBar({
  activeMode,
  initialSuggestions,
  onModeChange,
  onLoadThread,
  onNewThread,
  onSearchClick,
  threadId,
  threads,
}: DashboardIconBarProps) {
  const { locale } = useSitePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveThreads, setArchiveThreads] = useState<AgentThreadSummary[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const [suggestions, setSuggestions] = useState<AgentInboxSuggestion[]>(initialSuggestions);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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

  const visibleThreads = filteredThreads.slice(0, searchQuery.trim() ? filteredThreads.length : 8);

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

  const loadArchivedThreads = useCallback(async () => {
    if (archiveLoaded) {
      setArchiveOpen((v) => !v);
      return;
    }
    setArchiveOpen(true);
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
          <button
            type="button"
            className="sunny-codex-sidebar-action"
            aria-label="搜索"
            onClick={onSearchClick}
          >
            <span className="sunny-codex-sidebar-icon"><DashboardIcon name="search" /></span>
            <span className="sunny-codex-sidebar-label">搜索</span>
          </button>
          <button type="button" className="sunny-codex-sidebar-action" aria-label="命令中心">
            <span className="sunny-codex-sidebar-icon"><DashboardIcon name="command" /></span>
            <span className="sunny-codex-sidebar-label">命令中心</span>
          </button>
        </div>
        </section>

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
            {DASHBOARD_MODES.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className={`sunny-codex-mode-row${mode.key === activeMode ? " is-active" : ""}`}
                aria-current={mode.key === activeMode ? "true" : undefined}
                onClick={() => onModeChange(mode.key, mode.prompt)}
              >
                <span className="sunny-codex-sidebar-icon"><DashboardIcon name={mode.icon} /></span>
                <span className="sunny-codex-sidebar-label">{mode.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Suggestions section */}
        {suggestions.length > 0 ? (
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
        ) : (
          <section className="sunny-codex-sidebar-section" aria-label="快捷入口">
            <p>💡 快捷入口</p>
            <div className="sunny-codex-mode-list">
              <button
                type="button"
                className="sunny-codex-mode-row"
                style={{ fontSize: "11px", color: "#888" }}
                onClick={() => onModeChange("agent", "/plan 新建计划")}
              >
                /plan 新建计划
              </button>
              <button
                type="button"
                className="sunny-codex-mode-row"
                style={{ fontSize: "11px", color: "#888" }}
                onClick={() => onModeChange("agent", "/schedule 安排日程")}
              >
                /schedule 安排日程
              </button>
              <button
                type="button"
                className="sunny-codex-mode-row"
                style={{ fontSize: "11px", color: "#888" }}
                onClick={() => onModeChange("agent", "/review 生成复盘")}
              >
                /review 生成复盘
              </button>
            </div>
          </section>
        )}

        <section className="sunny-codex-sidebar-section sunny-codex-thread-section" aria-label="会话">
          <p>会话</p>
          {visibleThreads.length > 0 ? (
            visibleThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`sunny-codex-thread-row${thread.id === threadId ? " is-active" : ""}`}
                onClick={() => onLoadThread(thread.id)}
              >
                <span>{thread.title || `会话 #${thread.id}`}</span>
                <small>{formatThreadMeta(thread)}</small>
              </button>
            ))
          ) : (
            <span className="sunny-codex-empty-label">暂无聊天</span>
          )}
        </section>

        <section className="sunny-codex-sidebar-section sunny-codex-archive-section" aria-label="已归档">
          <button
            type="button"
            className="sunny-codex-archive-toggle"
            onClick={loadArchivedThreads}
            aria-expanded={archiveOpen}
          >
            <span>{archiveOpen ? "▾" : "▸"}</span>
            <span className="sunny-codex-sidebar-icon"><DashboardIcon name="archive" /></span> 已归档
            {archiveLoaded ? ` (${archiveThreads.length})` : ""}
          </button>
          {archiveOpen ? (
            archiveLoading ? (
              <span className="sunny-codex-empty-label">加载中...</span>
            ) : archiveThreads.length > 0 ? (
              archiveThreads.slice(0, 12).map((thread) => (
                <div key={thread.id} className="sunny-codex-archive-thread">
                  <span className="sunny-codex-sidebar-label">{thread.title || `会话 #${thread.id}`}</span>
                  <button
                    type="button"
                    className="sunny-codex-archive-restore-btn"
                    onClick={(e) => { e.stopPropagation(); void restoreThread(thread.id); }}
                  >
                    恢复
                  </button>
                </div>
              ))
            ) : (
              <span className="sunny-codex-empty-label">没有已归档的会话</span>
            )
          ) : null}
        </section>
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
    </nav>
  );
}
