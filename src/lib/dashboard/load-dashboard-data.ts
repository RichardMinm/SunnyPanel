import "server-only";

import { getPendingAgentSuggestions, syncAgentSuggestionsFromWorkspaceSnapshot, type AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";

export type DashboardSearchParams = {
  threadId?: string;
  week?: string;
};

export type LoadedDashboardData = {
  initialThreadId?: number;
  initialSuggestions: AgentInboxSuggestion[];
};

export const parseDashboardThreadId = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
};

export const loadDashboardData = async (searchParams: DashboardSearchParams): Promise<LoadedDashboardData> => {
  const initialThreadId = parseDashboardThreadId(searchParams.threadId);

  const snapshot = await getCachedWorkspaceSnapshot();

  await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);

  const initialSuggestions = await getPendingAgentSuggestions(6);

  return {
    initialThreadId,
    initialSuggestions,
  };
};
