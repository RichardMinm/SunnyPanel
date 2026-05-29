"use client";

import { useCallback, useEffect, useState } from "react";

import type { DashboardLayout } from "./types";

const STORAGE_KEY = "sunny-dashboard-layout";
const DEBUG_MODE_KEY = "sunny-dashboard-debug-mode";

const layoutItems: Array<{ key: DashboardLayout; label: string; shortcut: string }> = [
  { key: "balanced", label: "均衡", shortcut: "1" },
  { key: "focus", label: "聚焦", shortcut: "2" },
  { key: "inspector", label: "检查", shortcut: "3" },
];

function readStoredLayout(): DashboardLayout {
  if (typeof window === "undefined") return "balanced";

  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored === "focus" || stored === "inspector" || stored === "balanced") {
    return stored;
  }

  return "balanced";
}

export function useDashboardLayout() {
  const [layout, setLayoutState] = useState<DashboardLayout>(readStoredLayout);

  const setLayout = useCallback((next: DashboardLayout) => {
    setLayoutState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (!event.altKey) return;

      const match = layoutItems.find((item) => item.shortcut === event.key);

      if (match) {
        event.preventDefault();
        setLayout(match.key);
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [setLayout]);

  return { layout, setLayout };
}

function readStoredDebugMode(): boolean {
  if (typeof window === "undefined") return false;

  return localStorage.getItem(DEBUG_MODE_KEY) === "true";
}

export function useDebugMode() {
  const [debugMode, setDebugModeState] = useState<boolean>(readStoredDebugMode);

  const setDebugMode = useCallback((next: boolean) => {
    setDebugModeState(next);
    localStorage.setItem(DEBUG_MODE_KEY, String(next));
  }, []);

  return { debugMode, setDebugMode };
}

type DashboardLayoutSwitcherProps = {
  layout: DashboardLayout;
  onLayoutChange: (layout: DashboardLayout) => void;
};

export function DashboardLayoutSwitcher({ layout, onLayoutChange }: DashboardLayoutSwitcherProps) {
  return (
    <div className="sunny-agent-layout-switcher" role="radiogroup" aria-label="工作台布局">
      {layoutItems.map((item) => (
        <button
          key={item.key}
          type="button"
          role="radio"
          aria-checked={item.key === layout}
          className={item.key === layout ? "active" : ""}
          onClick={() => onLayoutChange(item.key)}
          title={`${item.label} (Alt+${item.shortcut})`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
