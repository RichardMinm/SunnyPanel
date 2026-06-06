"use client";

import type { CSSProperties, ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  panelOpen: boolean;
  panelWidth?: number;
};

export function AppShell({ children, panelOpen, panelWidth }: AppShellProps) {
  const style = panelWidth
    ? ({
        "--dashboard-panel-width": `${panelWidth}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div
      className={`sunny-dashboard-shell sunny-app-shell${panelOpen ? " is-panel-expanded" : ""}`}
      data-panel-state={panelOpen ? "expanded" : "collapsed"}
      data-testid="dashboard-shell"
      style={style}
    >
      {children}
    </div>
  );
}
