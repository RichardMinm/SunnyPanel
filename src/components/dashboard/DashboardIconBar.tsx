"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { getPendingActionLabel } from "@/components/dashboard/agent/utils";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export type DashboardIconMode = "agent" | "today" | "plans" | "schedule" | "writing" | "memory";
type DashboardIconName = "agent" | "calendar" | "command" | "memory" | "new" | "pencil" | "plans" | "project" | "schedule" | "search" | "settings";

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

function DashboardNavIcon({ name }: { name: DashboardIconName }) {
  const paths: Record<DashboardIconName, ReactNode> = {
    agent: (
      <>
        <path d="M4.75 5.5h10.5v9H4.75z" />
        <path d="M7.2 9h.05M10 9h.05M12.8 9h.05M7.5 12h5" />
      </>
    ),
    calendar: (
      <>
        <path d="M5.25 4.75h9.5v10.5h-9.5zM7.25 3.75v2M12.75 3.75v2M5.25 8h9.5" />
        <path d="M8 10.75h.05M10 10.75h.05M12 10.75h.05M8 12.75h.05M10 12.75h.05" />
      </>
    ),
    command: (
      <>
        <path d="M7.25 7.25h5.5v5.5h-5.5z" />
        <path d="M7.25 7.25H6a1.75 1.75 0 1 1 1.75-1.75v1.75M12.75 7.25V5.5a1.75 1.75 0 1 1 1.75 1.75h-1.75M12.75 12.75H14a1.75 1.75 0 1 1-1.75 1.75v-1.75M7.25 12.75v1.75A1.75 1.75 0 1 1 5.5 12.75h1.75" />
      </>
    ),
    memory: (
      <>
        <path d="M10 4.5a3.5 3.5 0 0 0-3.5 3.5v4.5a2 2 0 0 0 2 2h3a2 2 0 0 0 2-2V8A3.5 3.5 0 0 0 10 4.5Z" />
        <path d="M6.5 8h7M6.5 11h7M8.25 4.9v9.2M11.75 4.9v9.2" />
      </>
    ),
    new: (
      <>
        <path d="M5 14.5 14.5 5M8 5h6.5v6.5" />
        <path d="M4.5 5.5v10h10" />
      </>
    ),
    pencil: (
      <>
        <path d="m5 13.75.8-3.05 6.6-6.6a1.55 1.55 0 0 1 2.2 2.2l-6.6 6.6-3 .85Z" />
        <path d="m11.5 5.05 2.45 2.45" />
      </>
    ),
    plans: (
      <>
        <path d="M5.25 4.75h9.5v10.5h-9.5z" />
        <path d="M7.4 7.25h5.2M7.4 10h5.2M7.4 12.75h3.2" />
      </>
    ),
    project: (
      <>
        <path d="M4.75 6.25h4.1l1.2 1.5h5.2v7H4.75z" />
        <path d="M4.75 8.25h10.5" />
      </>
    ),
    schedule: (
      <>
        <path d="M10 15.25a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5Z" />
        <path d="M10 7.25v3.15l2.15 1.25" />
      </>
    ),
    search: (
      <>
        <path d="M9 13.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z" />
        <path d="m12.25 12.25 3 3" />
      </>
    ),
    settings: (
      <>
        <path d="M10 12.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
        <path d="m10.65 4.45.45 1.25a4.9 4.9 0 0 1 1.05.45l1.25-.55 1 1.75-.95.85c.05.38.05.75 0 1.13l.95.85-1 1.75-1.25-.55c-.33.2-.68.35-1.05.45l-.45 1.25h-2l-.45-1.25a4.9 4.9 0 0 1-1.05-.45l-1.25.55-1-1.75.95-.85a4.7 4.7 0 0 1 0-1.13l-.95-.85 1-1.75 1.25.55c.33-.2.68-.35 1.05-.45l.45-1.25h2Z" />
      </>
    ),
  };

  return (
    <svg aria-hidden="true" className="sunny-dashboard-nav-icon" viewBox="0 0 20 20" fill="none">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.45">
        {paths[name]}
      </g>
    </svg>
  );
}

export type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onLoadThread: (threadId: number) => void;
  onNewThread: () => void;
  onSearchClick?: () => void;
  threadId: null | number;
  threads: AgentThreadSummary[];
};

export function DashboardIconBar({
  activeMode,
  onModeChange,
  onLoadThread,
  onNewThread,
  onSearchClick,
  threadId,
  threads,
}: DashboardIconBarProps) {
  const { locale } = useSitePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const visibleThreads = threads.slice(0, 8);

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
            <span className="sunny-codex-sidebar-icon"><DashboardNavIcon name="new" /></span>
            <span className="sunny-codex-sidebar-label">新对话</span>
          </button>
          <button
            type="button"
            className="sunny-codex-sidebar-action"
            aria-label="搜索"
            onClick={onSearchClick}
          >
            <span className="sunny-codex-sidebar-icon"><DashboardNavIcon name="search" /></span>
            <span className="sunny-codex-sidebar-label">搜索</span>
          </button>
          <button type="button" className="sunny-codex-sidebar-action" aria-label="命令中心">
            <span className="sunny-codex-sidebar-icon"><DashboardNavIcon name="command" /></span>
            <span className="sunny-codex-sidebar-label">命令中心</span>
          </button>
        </div>
        </section>

        <section className="sunny-codex-sidebar-section" aria-label="项目">
          <p>项目</p>
          <div className="sunny-codex-project-row is-static">
            <span className="sunny-codex-sidebar-icon sunny-codex-project-icon"><DashboardNavIcon name="project" /></span>
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
                <span className="sunny-codex-sidebar-icon"><DashboardNavIcon name={mode.icon} /></span>
                <span className="sunny-codex-sidebar-label">{mode.label}</span>
              </button>
            ))}
          </div>
        </section>

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
            <span className="sunny-codex-sidebar-icon"><DashboardNavIcon name="settings" /></span>
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
