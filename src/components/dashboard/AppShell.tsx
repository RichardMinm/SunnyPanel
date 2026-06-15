"use client";

import type { CSSProperties, ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  panelOpen: boolean;
  panelWidth?: number;
  sidebarCollapsed?: boolean;
};

export function AppShell({ children, panelOpen, panelWidth, sidebarCollapsed }: AppShellProps) {
  const style = panelWidth
    ? ({
        "--dashboard-panel-width": `${panelWidth}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`sunny-dashboard-shell sunny-app-shell${panelOpen ? " is-panel-expanded" : ""}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}
      data-panel-state={panelOpen ? "expanded" : "collapsed"}
      data-sidebar-state={sidebarCollapsed ? "collapsed" : "expanded"}
      data-testid="dashboard-shell"
      style={style}
    >
      {children}
    </div>
  );
}
