import type { AgentInspectorTab } from "@/components/dashboard/agent/types";
import type { DashboardIconMode } from "@/components/dashboard/DashboardIconBar";

const standaloneModes = new Set<DashboardIconMode>([
  "agent",
  "checklist",
  "memory",
  "schedule",
  "timeline",
  "writing",
]);

export type DashboardNavigationDestination = {
  activeMode: DashboardIconMode;
  inspectorTab: AgentInspectorTab | null;
  panelOpen: boolean;
};

export const resolveDashboardNavigationDestination = (
  requestedMode: null | string,
): DashboardNavigationDestination => {
  if (requestedMode === "plans") {
    return {
      activeMode: "agent",
      inspectorTab: "plans",
      panelOpen: true,
    };
  }

  return {
    activeMode: standaloneModes.has(requestedMode as DashboardIconMode)
      ? requestedMode as DashboardIconMode
      : "agent",
    inspectorTab: null,
    panelOpen: false,
  };
};
