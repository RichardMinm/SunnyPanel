import "server-only";

import { buildAgentQuickPrompts } from "@/lib/agent/quick-prompts";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import {
  getPendingAgentSuggestions,
  syncAgentSuggestionsFromWorkspaceSnapshot,
} from "@/lib/agent/suggestions";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";

export type DashboardSearchParams = {
  threadId?: string;
  week?: string;
};

export type LoadedDashboardData = {
  agentQuickPrompts: AgentQuickPrompt[];
  agentSuggestions: AgentInboxSuggestion[];
  initialThreadId?: number;
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

  const [snapshot, agentSuggestions] = await Promise.all([
    getCachedWorkspaceSnapshot(),
    getPendingAgentSuggestions(3),
  ]);

  await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);

  const agentQuickPrompts = buildAgentQuickPrompts(snapshot);

  return {
    agentQuickPrompts,
    agentSuggestions,
    initialThreadId,
  };
};
