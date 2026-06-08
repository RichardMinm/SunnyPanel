"use client";

import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { DashboardIconBar, type DashboardIconBarProps } from "./DashboardIconBar";

export type SidebarNavProps = DashboardIconBarProps & {
  initialSuggestions: AgentInboxSuggestion[];
};

export function SidebarNav({ initialSuggestions, ...props }: SidebarNavProps) {
  return <DashboardIconBar {...props} initialSuggestions={initialSuggestions} />;
}
