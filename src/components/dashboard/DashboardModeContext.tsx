"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { DashboardIconMode } from "./DashboardIconBar";

const DashboardModeContext = createContext<DashboardIconMode>("agent");
const DashboardModeNavigationContext = createContext<
  ((mode: DashboardIconMode) => void) | null
>(null);

export function DashboardModeProvider({
  children,
  onModeChange,
  value,
}: {
  children: ReactNode;
  onModeChange?: (mode: DashboardIconMode) => void;
  value: DashboardIconMode;
}) {
  return (
    <DashboardModeNavigationContext.Provider value={onModeChange ?? null}>
      <DashboardModeContext.Provider value={value}>
        {children}
      </DashboardModeContext.Provider>
    </DashboardModeNavigationContext.Provider>
  );
}

export function useDashboardMode() {
  return useContext(DashboardModeContext);
}

export function useDashboardModeNavigation() {
  return useContext(DashboardModeNavigationContext);
}
