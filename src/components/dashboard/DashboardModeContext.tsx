"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { DashboardIconMode } from "./DashboardIconBar";

const DashboardModeContext = createContext<DashboardIconMode>("agent");

export function DashboardModeProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: DashboardIconMode;
}) {
  return (
    <DashboardModeContext.Provider value={value}>
      {children}
    </DashboardModeContext.Provider>
  );
}

export function useDashboardMode() {
  return useContext(DashboardModeContext);
}
