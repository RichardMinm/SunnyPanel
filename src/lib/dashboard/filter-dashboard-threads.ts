import type { AgentThreadSummary } from "@/components/dashboard/agent/types";

export const filterDashboardThreads = (
  threads: AgentThreadSummary[],
  query: string,
): AgentThreadSummary[] => {
  if (!query.trim()) {
    return threads;
  }

  const normalized = query.trim().toLowerCase();

  return threads.filter(
    (thread) =>
      thread.title.toLowerCase().includes(normalized) ||
      thread.tags?.some((tag) => tag.toLowerCase().includes(normalized)),
  );
};
