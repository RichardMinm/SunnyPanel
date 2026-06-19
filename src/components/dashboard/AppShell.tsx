"use client";

import type { CSSProperties, ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  panelOpen: boolean;
  panelWidth?: number;
  sidebarCollapsed?: boolean;
  sidebarExpanded?: boolean;
  sidebarPinned?: boolean;
};

export function AppShell({
  children,
  panelOpen,
  panelWidth,
  sidebarCollapsed,
  sidebarExpanded = false,
  sidebarPinned = false,
}: AppShellProps) {
  const style = panelWidth
    ? ({
        "--dashboard-panel-width": `${panelWidth}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`sunny-dashboard-shell sunny-app-shell${panelOpen ? " is-panel-expanded" : ""}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}${sidebarExpanded ? " is-sidebar-expanded" : " is-sidebar-auto-collapsed"}${sidebarPinned ? " is-sidebar-pinned" : ""}`}
      data-panel-state={panelOpen ? "expanded" : "collapsed"}
      data-sidebar-state={sidebarExpanded ? "expanded" : "collapsed"}
      data-testid="dashboard-shell"
      style={style}
    >
      {children}
    </div>
  );
}
