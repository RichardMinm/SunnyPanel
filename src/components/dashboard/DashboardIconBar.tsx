"use client";

import Link from "next/link";
import { useState } from "react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export type DashboardIconMode = "agent" | "today" | "plans" | "schedule" | "writing" | "memory";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: string;
  prompt: string;
}> = [
  { key: "agent",   label: "工作台",  icon: "S",  prompt: "" },
  { key: "today",   label: "今日",   icon: "📅", prompt: "帮我整理今天最应该推进的工作" },
  { key: "plans",   label: "计划",   icon: "📋", prompt: "帮我检查所有进行中计划的进度" },
  { key: "schedule", label: "日程",   icon: "⏱",  prompt: "帮我查看最近的日程安排" },
  { key: "writing", label: "写作",   icon: "✏️", prompt: "帮我整理最近的写作素材" },
  { key: "memory",  label: "记忆库", icon: "🧠", prompt: "" },
];

export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onSearchClick?: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function DashboardIconBar({
  activeMode,
  onModeChange,
  onLoadThread,
  onNewThread,
  onSearchClick,
  onTogglePanel,
  panelOpen,
  threadId,
  threads,
}: DashboardIconBarProps) {
  const { locale } = useSitePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleThreads = threads.slice(0, 8);
  const pinnedThreads = threads.filter((thread) => !thread.archived && thread.pendingAction).slice(0, 2);

  return (
    <nav className="sunny-dashboard-icon-bar sunny-sidebar-nav sunny-codex-sidebar" aria-label="工作台导航">
      <div className="sunny-codex-sidebar-top">
        <div className="sunny-codex-sidebar-window-controls" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <Link
          href="/dashboard"
          className="sunny-codex-project-row"
          title="SunnyPanel"
          aria-label="SunnyPanel 首页"
        >
          <span className="sunny-codex-project-mark">S</span>
          <span>SunnyPanel</span>
        </Link>

        <div className="sunny-codex-sidebar-actions" aria-label="全局操作">
          <button
            type="button"
            className="sunny-codex-sidebar-action"
            aria-label="新对话"
            onClick={onNewThread}
          >
            <span>↗</span>
            新对话
          </button>
          <button
            type="button"
            className="sunny-codex-sidebar-action"
            aria-label="搜索"
            onClick={onSearchClick}
          >
            <span>⌕</span>
            搜索
          </button>
          <button type="button" className="sunny-codex-sidebar-action" aria-label="插件">
            <span>⌘</span>
            插件
          </button>
          <button type="button" className="sunny-codex-sidebar-action" aria-label="自动化">
            <span>◷</span>
            自动化
          </button>
        </div>

        <section className="sunny-codex-sidebar-section" aria-label="置顶">
          <p>置顶</p>
          {pinnedThreads.length > 0 ? (
            pinnedThreads.map((thread) => (
              <button
                key={`pinned-${thread.id}`}
                type="button"
                className={`sunny-codex-thread-row${thread.id === threadId ? " is-active" : ""}`}
                onClick={() => onLoadThread(thread.id)}
              >
                <span>{thread.title || `会话 #${thread.id}`}</span>
                <small>{thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : `#${thread.id}`}</small>
              </button>
            ))
          ) : (
            <span className="sunny-codex-empty-label">暂无置顶</span>
          )}
        </section>

        <section className="sunny-codex-sidebar-section" aria-label="项目">
          <p>项目</p>
          <div className="sunny-codex-project-row is-static">
            <span className="sunny-codex-project-mark">⌁</span>
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
                <span>{mode.icon}</span>
                {mode.label}
              </button>
            ))}
          </div>
        </section>

        <section className="sunny-codex-sidebar-section sunny-codex-thread-section" aria-label="对话">
          <p>对话</p>
          {visibleThreads.length > 0 ? (
            visibleThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`sunny-codex-thread-row${thread.id === threadId ? " is-active" : ""}`}
                onClick={() => onLoadThread(thread.id)}
              >
                <span>{thread.title || `会话 #${thread.id}`}</span>
                <small>{thread.pendingAction ? getPendingActionLabel(thread.pendingAction) : thread.tags?.[0] ?? `#${thread.id}`}</small>
              </button>
            ))
          ) : (
            <span className="sunny-codex-empty-label">暂无聊天</span>
          )}
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
            <span>⚙</span>
            设置
          </button>
          {settingsOpen ? (
            <div className="sunny-dashboard-settings-popover" role="dialog" aria-label="设置">
              <p>主题</p>
              <ThemeToggle locale={locale} variant="admin" />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className="sunny-codex-sidebar-action sunny-codex-panel-toggle"
          title={panelOpen ? "收起面板" : "展开面板"}
          aria-label={panelOpen ? "收起面板" : "展开面板"}
          onClick={onTogglePanel}
        >
          <span>{panelOpen ? "›" : "‹"}</span>
          {panelOpen ? "收起环境" : "展开环境"}
        </button>
      </div>
    </nav>
  );
}
