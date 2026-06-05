"use client";

import type { CSSProperties, ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  panelWidth: number;
  panelOpen: boolean;
};

export function AppShell({ children, panelOpen, panelWidth }: AppShellProps) {
  return (
    <div
      className={`sunny-dashboard-shell sunny-app-shell${panelOpen ? " is-panel-open" : " is-panel-collapsed"}`}
      data-panel-state={panelOpen ? "open" : "closed"}
      data-testid="dashboard-shell"
      style={{ "--dashboard-panel-width": `${panelWidth}px` } as CSSProperties}
    >
      {children}
    </div>
  );
}
