"use client";

import { DASHBOARD_MODES, type DashboardIconMode } from "./DashboardIconBar";

type DashboardModeChipsProps = {
  activeMode: DashboardIconMode;
  onModeChange: (mode: DashboardIconMode, prompt: string) => void;
};

export function DashboardModeChips({ activeMode, onModeChange }: DashboardModeChipsProps) {
  return (
    <nav className="sunny-dashboard-mode-chips" aria-label="Agent 模式切换">
      {DASHBOARD_MODES.map((mode) => (
        <button
          key={mode.key}
          type="button"
          className={`sunny-dashboard-mode-chip${mode.key === activeMode ? " is-active" : ""}`}
          aria-pressed={mode.key === activeMode}
          onClick={() => onModeChange(mode.key, mode.prompt)}
        >
          {mode.label}
        </button>
      ))}
    </nav>
  );
}
