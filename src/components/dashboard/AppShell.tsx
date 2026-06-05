"use client";

import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
  panelOpen: boolean;
};

export function AppShell({ children, panelOpen }: AppShellProps) {
  return (
    <div
      className={`sunny-dashboard-shell sunny-app-shell${panelOpen ? " is-panel-expanded" : ""}`}
      data-panel-state={panelOpen ? "expanded" : "collapsed"}
      data-testid="dashboard-shell"
    >
      {children}
    </div>
  );
}
