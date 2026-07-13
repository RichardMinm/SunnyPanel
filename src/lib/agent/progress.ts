import type { QueryProgressArgs } from "./schemas";
import { loadAggregateProgressFacts } from "./query/facts-repository";

export type ChecklistProgress = {
  completedItems: number;
  completionRate: number;
  id: number;
  lastCompletedAt: null | string;
  openItems: string[];
  title: string;
  totalItems: number;
};

export type AgentProgressSnapshot = {
  checklists: ChecklistProgress[];
  generatedAt: string;
  summary: {
    activePlans: number;
    backlogPlans: number;
    checklistCount: number;
    completedChecklistItems: number;
    completedPlans: number;
    dueSoonPlans: number;
    highPriorityPlans: number;
    overallChecklistCompletionRate: number;
    overduePlans: number;
    pausedPlans: number;
    planCount: number;
    totalChecklistItems: number;
  };
};

export const getAgentProgressSnapshot = async ({
  checklistTitle,
}: QueryProgressArgs = {}): Promise<AgentProgressSnapshot> => {
  return (await loadAggregateProgressFacts({ checklistTitle })).snapshot;
};

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

export const formatProgressAssistantMessage = (snapshot: AgentProgressSnapshot, args: QueryProgressArgs = {}) => {
  if (args.checklistTitle && snapshot.checklists.length === 0) {
    return `我没找到「${args.checklistTitle}」这份清单，所以还不能给出它的进度统计。`;
  }

  if (args.checklistTitle && snapshot.checklists[0]) {
    const checklist = snapshot.checklists[0];
    const openItemText =
      checklist.openItems.length > 0 ? `未完成项前几条：${checklist.openItems.join("、")}。` : "这份清单没有未完成项。";

    return `「${checklist.title}」当前完成 ${checklist.completedItems}/${checklist.totalItems}，完成率 ${formatPercent(
      checklist.completionRate,
    )}。${openItemText}`;
  }

  const { summary } = snapshot;
  const riskLine =
    summary.overduePlans > 0 || summary.dueSoonPlans > 0
      ? `其中 ${summary.overduePlans} 项计划已逾期，${summary.dueSoonPlans} 项计划 7 天内到期。`
      : "最近 7 天内没有临近截止或已逾期的计划。";
  const planLine = `当前共有 ${summary.planCount} 项计划：进行中 ${summary.activePlans}，待开始 ${summary.backlogPlans}，暂停 ${summary.pausedPlans}，已完成 ${summary.completedPlans}。${riskLine}`;
  const checklistLine =
    summary.totalChecklistItems > 0
      ? `当前统计 ${summary.checklistCount} 份清单，条目完成 ${summary.completedChecklistItems}/${summary.totalChecklistItems}，整体完成率 ${formatPercent(
          summary.overallChecklistCompletionRate,
        )}。`
      : "目前还没有可统计的清单条目。";

  if (args.scope === "plans") {
    return planLine;
  }

  if (args.scope === "checklists") {
    return checklistLine;
  }

  return `${planLine}${checklistLine}`;
};

export const queryProgressFromIntent = async (args: QueryProgressArgs) => {
  const snapshot = await getAgentProgressSnapshot(args);

  return {
    assistantMessage: formatProgressAssistantMessage(snapshot, args),
    pendingAction: null,
  };
};
