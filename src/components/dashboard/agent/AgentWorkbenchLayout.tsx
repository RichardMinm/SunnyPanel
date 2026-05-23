import type { ReactNode } from "react";

import type { DashboardLayout } from "./types";

type AgentWorkbenchLayoutProps = {
  center: ReactNode;
  dataTestId?: string;
  inspector: null | ReactNode;
  layout?: DashboardLayout;
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
};

export function AgentWorkbenchLayout({
  center,
  dataTestId,
  inspector,
  layout = "balanced",
  sidebar,
  sidebarCollapsed = false,
}: AgentWorkbenchLayoutProps) {
  const noInspector = !inspector;
  const classes = [
    "sunny-agent-workbench-layout",
    noInspector ? "sunny-agent-workbench-layout--no-inspector" : "",
    layout !== "balanced" ? `sunny-agent-layout-${layout}` : "",
    sidebarCollapsed ? "sunny-agent-sidebar-collapsed" : "",
  ].filter(Boolean).join(" ");

  return (
    <section className={classes} data-testid={dataTestId}>
      {sidebar}
      <main className="sunny-agent-center-surface">{center}</main>
      {inspector}
    </section>
  );
}
