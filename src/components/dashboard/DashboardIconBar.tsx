"use client";

import Link from "next/link";
import { ThemeToggle } from "@/components/public/ThemeToggle";
import { useSitePreferences } from "@/components/shared/SitePreferencesProvider";

export type DashboardIconMode = "agent" | "today" | "plans" | "schedule" | "writing" | "memory";

export const DASHBOARD_MODES: Array<{
  key: DashboardIconMode;
  label: string;
  icon: string;
  prompt: string;
}> = [
  { key: "agent",   label: "Agent",  icon: "S",  prompt: "" },
  { key: "today",   label: "今日",   icon: "📅", prompt: "帮我整理今天最应该推进的工作" },
  { key: "plans",   label: "计划",   icon: "📋", prompt: "帮我检查所有进行中计划的进度" },
  { key: "schedule", label: "日程",   icon: "⏱",  prompt: "帮我查看最近的日程安排" },
  { key: "writing", label: "写作",   icon: "✏️", prompt: "帮我整理最近的写作素材" },
  { key: "memory",  label: "记忆",   icon: "🧠", prompt: "帮我回顾最近的经验教训" },
];

type DashboardIconBarProps = {
  activeMode: DashboardIconMode;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
  onSearchClick?: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
};

export function DashboardIconBar({
  activeMode,
  onModeChange,
  onSearchClick,
  onTogglePanel,
  panelOpen,
}: DashboardIconBarProps) {
  const { locale } = useSitePreferences();

  return (
    <nav className="sunny-dashboard-icon-bar" aria-label="工作台导航">
      <div className="sunny-dashboard-icon-bar-top">
        {/* Brand — click to return to Agent mode */}
        <Link
          href="/dashboard"
          className="sunny-dashboard-icon-brand"
          title="SunnyPanel"
          aria-label="SunnyPanel 首页"
        >
          S
        </Link>

        <span className="sunny-dashboard-icon-separator" aria-hidden="true" />

        {/* Mode icons */}
        {DASHBOARD_MODES.map((mode) => (
          <button
            key={mode.key}
            type="button"
            className={`sunny-dashboard-icon-btn${mode.key === activeMode ? " is-active" : ""}`}
            title={mode.label}
            aria-label={mode.label}
            aria-current={mode.key === activeMode ? "true" : undefined}
            onClick={() => onModeChange(mode.key, mode.prompt)}
          >
            {mode.icon}
          </button>
        ))}

        <span className="sunny-dashboard-icon-separator" aria-hidden="true" />

        {/* Search */}
        {onSearchClick ? (
          <button
            type="button"
            className="sunny-dashboard-icon-btn"
            title="搜索 (⌘K)"
            aria-label="搜索"
            onClick={onSearchClick}
          >
            🔍
          </button>
        ) : null}
      </div>

      <div className="sunny-dashboard-icon-bar-bottom">
        <ThemeToggle locale={locale} variant="admin" />

        <button
          type="button"
          className="sunny-dashboard-icon-btn"
          title={panelOpen ? "收起面板" : "展开面板"}
          aria-label={panelOpen ? "收起面板" : "展开面板"}
          onClick={onTogglePanel}
        >
          {panelOpen ? "◀" : "▶"}
        </button>
      </div>
    </nav>
  );
}
