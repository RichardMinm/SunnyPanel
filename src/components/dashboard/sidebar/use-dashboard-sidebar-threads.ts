"use client";

import { useMemo } from "react";
import type { AgentThreadSummary } from "@/components/dashboard/agent/types";
import { filterDashboardThreads } from "@/lib/dashboard/filter-dashboard-threads";

export type UseDashboardSidebarThreadsInput = {
  threads: AgentThreadSummary[];
  searchQuery: string;
  threadListMode?: "compact" | "full" | "hidden";
};

export type UseDashboardSidebarThreadsReturn = {
  filteredThreads: AgentThreadSummary[];
  visibleThreads: AgentThreadSummary[];
};

/**
 * Derived thread data: search filtering + pagination slicing.
 * Pure computation — no side effects, no API calls, no state.
 */
export function useDashboardSidebarThreads({
  threads,
  searchQuery,
  threadListMode = "full",
}: UseDashboardSidebarThreadsInput): UseDashboardSidebarThreadsReturn {
  const filteredThreads = useMemo(
    () => filterDashboardThreads(threads, searchQuery),
    [threads, searchQuery],
  );

  const visibleThreads = useMemo(() => {
    const limit = threadListMode === "compact" ? 3 : 40;
    return filteredThreads.slice(0, limit);
  }, [filteredThreads, threadListMode]);

  return { filteredThreads, visibleThreads };
}
