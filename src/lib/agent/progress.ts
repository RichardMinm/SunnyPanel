import type { Checklist, Plan } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import type { QueryProgressArgs } from "./schemas";

type ChecklistGroup = NonNullable<Checklist["groups"]>[number];
type ChecklistItem = NonNullable<ChecklistGroup["items"]>[number];

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

const dayInMs = 1000 * 60 * 60 * 24;

const normalizeForSearch = (value: string) =>
  value.toLowerCase().replace(/[\s\-_/·，。！？、:：；;（）()]/g, "");

const scoreTextMatch = (candidate: string, query: string) => {
  const normalizedCandidate = normalizeForSearch(candidate);
  const normalizedQuery = normalizeForSearch(query);

  if (!normalizedCandidate || !normalizedQuery) {
    return 0;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 100;
  }

  if (normalizedCandidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedCandidate)) {
    return 80;
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return 60;
  }

  return 0;
};

const isOpenPlan = (plan: Plan) => plan.state !== "done";

const getDueDayOffset = (value?: null | string) => {
  if (!value) {
    return null;
  }

  const dueDate = new Date(value);

  if (Number.isNaN(dueDate.getTime())) {
    return null;
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

  return Math.round((startOfDueDate.getTime() - startOfToday.getTime()) / dayInMs);
};

const flattenChecklistItems = (checklist: Checklist) =>
  (checklist.groups ?? []).flatMap((group) =>
    (group.items ?? []).map((item) => ({
      group,
      item,
    })),
  );

const getLatestCompletedAt = (items: ChecklistItem[]) => {
  const sortedDates = items
    .map((item) => item.completedAt)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  return sortedDates[0] ?? null;
};

const buildChecklistProgress = (checklist: Checklist): ChecklistProgress => {
  const flattenedItems = flattenChecklistItems(checklist);
  const completedItems = flattenedItems.filter(({ item }) => item.isCompleted).map(({ item }) => item);
  const totalItems = flattenedItems.length;

  return {
    completedItems: completedItems.length,
    completionRate: totalItems > 0 ? completedItems.length / totalItems : 0,
    id: checklist.id,
    lastCompletedAt: getLatestCompletedAt(completedItems),
    openItems: flattenedItems
      .filter(({ item }) => !item.isCompleted)
      .map(({ group, item }) => `${group.title} / ${item.title}`)
      .slice(0, 5),
    title: checklist.title,
    totalItems,
  };
};

const filterChecklistsByTitle = (checklists: Checklist[], checklistTitle?: null | string) => {
  if (!checklistTitle) {
    return checklists;
  }

  return checklists
    .map((checklist) => ({
      checklist,
      score: scoreTextMatch(checklist.title, checklistTitle),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.checklist);
};

export const getAgentProgressSnapshot = async ({
  checklistTitle,
}: QueryProgressArgs = {}): Promise<AgentProgressSnapshot> => {
  const payload = await getPayloadClient();
  const [plans, checklists] = await Promise.all([
    payload.find({
      collection: "plans",
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: "dueDate",
    }),
    payload.find({
      collection: "checklists",
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
  ]);
  const visibleChecklists = filterChecklistsByTitle(checklists.docs, checklistTitle);
  const checklistProgress = visibleChecklists.map(buildChecklistProgress);
  const totalChecklistItems = checklistProgress.reduce((total, item) => total + item.totalItems, 0);
  const completedChecklistItems = checklistProgress.reduce((total, item) => total + item.completedItems, 0);
  const openPlans = plans.docs.filter(isOpenPlan);
  const dueDayOffsets = openPlans
    .map((plan) => getDueDayOffset(plan.dueDate))
    .filter((value): value is number => value !== null);

  return {
    checklists: checklistProgress,
    generatedAt: new Date().toISOString(),
    summary: {
      activePlans: plans.docs.filter((plan) => plan.state === "active").length,
      backlogPlans: plans.docs.filter((plan) => plan.state === "backlog").length,
      checklistCount: checklistProgress.length,
      completedChecklistItems,
      completedPlans: plans.docs.filter((plan) => plan.state === "done").length,
      dueSoonPlans: dueDayOffsets.filter((offset) => offset >= 0 && offset <= 7).length,
      highPriorityPlans: openPlans.filter((plan) => plan.priority === "high").length,
      overallChecklistCompletionRate: totalChecklistItems > 0 ? completedChecklistItems / totalChecklistItems : 0,
      overduePlans: dueDayOffsets.filter((offset) => offset < 0).length,
      pausedPlans: plans.docs.filter((plan) => plan.state === "paused").length,
      planCount: plans.totalDocs,
      totalChecklistItems,
    },
  };
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
