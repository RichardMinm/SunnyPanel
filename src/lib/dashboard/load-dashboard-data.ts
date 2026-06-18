import "server-only";

import { getPendingAgentSuggestions, syncAgentSuggestionsFromWorkspaceSnapshot, type AgentInboxSuggestion } from "@/lib/agent/suggestions";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";

export type DashboardSearchParams = {
  collection?: string | string[];
  id?: string | string[];
  mode?: string | string[];
  threadId?: string | string[];
  week?: string | string[];
};

export type LoadedDashboardData = {
  initialThreadId?: number;
  initialSuggestions: AgentInboxSuggestion[];
};

export const parseDashboardThreadId = (value?: string | string[]) => {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue);

  return Number.isFinite(parsed) ? parsed : undefined;
};

export const loadDashboardData = async (
  searchParams: DashboardSearchParams,
  redirectPath?: string,
): Promise<LoadedDashboardData> => {
  const initialThreadId = parseDashboardThreadId(searchParams.threadId);

  const snapshot = await getCachedWorkspaceSnapshot(redirectPath);

  await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);

  const initialSuggestions = await getPendingAgentSuggestions(6);

  return {
    initialThreadId,
    initialSuggestions,
  };
};
