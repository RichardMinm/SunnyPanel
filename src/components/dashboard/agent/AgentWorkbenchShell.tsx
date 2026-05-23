import type { ReactNode } from "react";

import { AgentWorkbenchLayout } from "./AgentWorkbenchLayout";
import type { DashboardLayout } from "./types";

type AgentWorkbenchShellProps = {
  center: ReactNode;
  dataTestId?: string;
  inspector: null | ReactNode;
  inspectorDrawer: boolean;
  layout?: DashboardLayout;
  sidebar: ReactNode;
  sidebarCollapsed?: boolean;
};

export function AgentWorkbenchShell({
  center,
  dataTestId,
  inspector,
  inspectorDrawer,
  layout,
  sidebar,
  sidebarCollapsed = false,
}: AgentWorkbenchShellProps) {
  return (
    <>
      <AgentWorkbenchLayout
        center={center}
        dataTestId={dataTestId}
        inspector={inspectorDrawer ? null : inspector}
        layout={layout}
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
      />
      {inspectorDrawer ? inspector : null}
    </>
  );
}
