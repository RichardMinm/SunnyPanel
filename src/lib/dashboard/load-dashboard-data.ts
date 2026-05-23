import "server-only";

import { buildDashboardPageViewModel, type DashboardPageViewModel } from "@/components/dashboard/dashboard-view-model";
import { buildAgentQuickPrompts } from "@/lib/agent/quick-prompts";
import type { AgentQuickPrompt } from "@/lib/agent/quick-prompts";
import type { AgentInboxSuggestion } from "@/lib/agent/suggestions";
import {
  getPendingAgentSuggestions,
  syncAgentSuggestionsFromWorkspaceSnapshot,
} from "@/lib/agent/suggestions";
import { parseWeekParam, formatDateKey } from "@/components/dashboard/calendar-utils";
import { getCachedWorkspaceSnapshot } from "@/lib/payload/workspace-cache";
import { getCachedWeekSchedule } from "@/lib/schedule/schedule-cache";
import { getSiteLocale } from "@/lib/site-locale";
import type { WeekSchedule } from "@/lib/schedule/items";

export type DashboardSearchParams = {
  threadId?: string;
  week?: string;
};

export type LoadedDashboardData = {
  agentQuickPrompts: AgentQuickPrompt[];
  agentSuggestions: AgentInboxSuggestion[];
  model: DashboardPageViewModel;
  weekSchedule: WeekSchedule;
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
  const locale = await getSiteLocale();
  const weekStart = parseWeekParam(searchParams.week ?? null);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekFrom = formatDateKey(weekStart);
  const weekTo = formatDateKey(weekEnd);

  const [snapshot, agentSuggestions] = await Promise.all([
    getCachedWorkspaceSnapshot(),
    getPendingAgentSuggestions(3),
  ]);

  const [, weekSchedule] = await Promise.all([
    syncAgentSuggestionsFromWorkspaceSnapshot(snapshot),
    getCachedWeekSchedule(weekFrom, weekTo),
  ]);

  const agentQuickPrompts = buildAgentQuickPrompts(snapshot);
  const model = buildDashboardPageViewModel({
    initialThreadId,
    locale,
    snapshot,
  });

  return {
    agentQuickPrompts,
    agentSuggestions,
    model,
    weekSchedule,
  };
};
