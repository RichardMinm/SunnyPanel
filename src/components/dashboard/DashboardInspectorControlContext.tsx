"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AgentInspectorTab } from "@/components/dashboard/agent/types";

type DashboardInspectorControlValue = {
  debugMode: boolean;
  openInspector: (tab?: AgentInspectorTab) => void;
  panelOpen: boolean;
  setDebugMode: (next: boolean) => void;
  togglePanel: () => void;
};

const noop = () => undefined;

const DashboardInspectorControlContext = createContext<DashboardInspectorControlValue>({
  debugMode: false,
  openInspector: noop,
  panelOpen: false,
  setDebugMode: noop,
  togglePanel: noop,
});

export function DashboardInspectorControlProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: DashboardInspectorControlValue;
}) {
  return (
    <DashboardInspectorControlContext.Provider value={value}>
      {children}
    </DashboardInspectorControlContext.Provider>
  );
}

export function useDashboardInspectorControl() {
  return useContext(DashboardInspectorControlContext);
}
