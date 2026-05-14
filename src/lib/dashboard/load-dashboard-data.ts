import "server-only";

import { buildDashboardPageViewModel, type DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { buildAgentQuickPrompts } from "@/lib/agent/quick-prompts";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import {
  getPendingAgentSuggestions,
  syncAgentSuggestionsFromWorkspaceSnapshot,
} from "@/lib/agent/suggestions";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";
import { getSiteLocale } from "@/lib/site-locale";

export type DashboardSearchParams = {
  agent?: string;
  threadId?: string;
};

export type LoadedDashboardData = {
  agentQuickPrompts: AgentQuickPrompt[];
  agentSuggestions: AgentInboxSuggestion[];
  model: DashboardPageViewModel;
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
  const showFullAgentConsole = searchParams.agent === "full";
  const locale = await getSiteLocale();
  const snapshot = await getCachedWorkspaceSnapshot();
  await syncAgentSuggestionsFromWorkspaceSnapshot(snapshot);
  const agentSuggestions = await getPendingAgentSuggestions(3);
  const agentQuickPrompts = buildAgentQuickPrompts(snapshot);
  const model = buildDashboardPageViewModel({
    initialThreadId,
    locale,
    showFullAgentConsole,
    snapshot,
  });

  return {
    agentQuickPrompts,
    agentSuggestions,
    model,
  };
};
