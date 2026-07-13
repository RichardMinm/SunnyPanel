import type { Checklist, Plan } from "@/payload-types";
import { scoreTextMatch } from "../tool-shared";
import type { AgentProgressSnapshot, ChecklistProgress } from "../progress";
import type { PlanProgressFacts } from "./types";

type ChecklistGroup = NonNullable<Checklist["groups"]>[number];
type ChecklistItem = NonNullable<ChecklistGroup["items"]>[number];
const dayInMs = 1000 * 60 * 60 * 24;

const flattenChecklistItems = (checklist: Checklist) =>
  (checklist.groups ?? []).flatMap((group) =>
    (group.items ?? []).map((item) => ({ group, item })),
  );

const getLatestCompletedAt = (items: ChecklistItem[]) =>
  items.map((item) => item.completedAt).filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

export const buildChecklistProgress = (checklist: Checklist): ChecklistProgress => {
  const flattenedItems = flattenChecklistItems(checklist);
  const completedItems = flattenedItems.filter(({ item }) => item.isCompleted).map(({ item }) => item);
  const totalItems = flattenedItems.length;
  return {
    completedItems: completedItems.length,
    completionRate: totalItems > 0 ? completedItems.length / totalItems : 0,
    id: checklist.id,
    lastCompletedAt: getLatestCompletedAt(completedItems),
    openItems: flattenedItems.filter(({ item }) => !item.isCompleted)
      .map(({ group, item }) => `${group.title} / ${item.title}`).slice(0, 5),
    title: checklist.title,
    totalItems,
  };
};

export const filterChecklistsByTitle = (checklists: Checklist[], checklistTitle?: null | string) => {
  if (!checklistTitle) return checklists;
  return checklists.map((checklist) => ({ checklist, score: scoreTextMatch(checklist.title, checklistTitle) }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score).map((item) => item.checklist);
};

export const buildAgentProgressSnapshot = ({ checklists, now, plans, totalPlans }: {
  checklists: Checklist[]; now: Date; plans: Plan[]; totalPlans: number;
}): AgentProgressSnapshot => {
  const checklistProgress = checklists.map(buildChecklistProgress);
  const totalChecklistItems = checklistProgress.reduce((total, item) => total + item.totalItems, 0);
  const completedChecklistItems = checklistProgress.reduce((total, item) => total + item.completedItems, 0);
  const openPlans = plans.filter((plan) => plan.state !== "done");
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueDayOffsets = openPlans.map((plan) => {
    if (!plan.dueDate) return null;
    const dueDate = new Date(plan.dueDate);
    if (Number.isNaN(dueDate.getTime())) return null;
    const startOfDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    return Math.round((startOfDueDate.getTime() - startOfToday.getTime()) / dayInMs);
  }).filter((value): value is number => value !== null);
  return {
    checklists: checklistProgress,
    generatedAt: now.toISOString(),
    summary: {
      activePlans: plans.filter((plan) => plan.state === "active").length,
      backlogPlans: plans.filter((plan) => plan.state === "backlog").length,
      checklistCount: checklistProgress.length,
      completedChecklistItems,
      completedPlans: plans.filter((plan) => plan.state === "done").length,
      dueSoonPlans: dueDayOffsets.filter((offset) => offset >= 0 && offset <= 7).length,
      highPriorityPlans: openPlans.filter((plan) => plan.priority === "high").length,
      overallChecklistCompletionRate: totalChecklistItems > 0 ? completedChecklistItems / totalChecklistItems : 0,
      overduePlans: dueDayOffsets.filter((offset) => offset < 0).length,
      pausedPlans: plans.filter((plan) => plan.state === "paused").length,
      planCount: totalPlans,
      totalChecklistItems,
    },
  };
};

export const toProgressPercent = (completed: number, total: number) =>
  total > 0 ? Math.round((completed / total) * 100) : 0;

export const buildPlanProgressFacts = (plan: Plan): PlanProgressFacts => ({
  kind: "plan_progress", planId: plan.id, title: plan.title, state: plan.state, priority: plan.priority,
  executionMode: plan.executionMode ?? null, totalEstimatedDays: plan.totalEstimatedDays ?? null,
  storedProgressPercent: plan.progress ?? null, weeklyRhythm: plan.weeklyRhythm ?? null, dueDate: plan.dueDate ?? null,
  phasesProvided: Array.isArray(plan.phases),
  phases: Array.isArray(plan.phases) ? (plan.phases as Array<{ title: string; goal: string; estimatedDays: number; milestones?: Array<{ tasks?: string[] }> }>).map((phase) => ({
    title: phase.title, goal: phase.goal, estimatedDays: phase.estimatedDays,
    milestoneCount: phase.milestones?.length ?? 0,
    taskCount: phase.milestones?.reduce((sum, milestone) => sum + (milestone.tasks?.length ?? 0), 0) ?? 0,
  })) : [],
});

export const formatPlanProgressAssistantMessage = (facts: PlanProgressFacts) => {
  const phaseInfo = facts.phases.length > 0 ? facts.phases.map((phase, index) =>
    `  阶段${index + 1}「${phase.title}」: ${phase.goal}（预计${phase.estimatedDays}天，${phase.milestoneCount}个里程碑）`).join("\n")
    : facts.phasesProvided ? "" : "（暂无阶段拆解数据）";
  const totalTasks = facts.phases.reduce((sum, phase) => sum + phase.taskCount, 0);
  return [
    `计划「${facts.title}」`,
    `状态: ${facts.state} | 优先级: ${facts.priority} | 执行模式: ${facts.executionMode ?? undefined}`,
    facts.totalEstimatedDays ? `预计总天数: ${facts.totalEstimatedDays} 天` : null,
    facts.storedProgressPercent != null ? `当前进度: ${facts.storedProgressPercent}%` : null,
    facts.weeklyRhythm ? `学习节奏: ${facts.weeklyRhythm}` : null,
    facts.dueDate ? `截止日期: ${facts.dueDate}` : null,
    facts.phases.length > 0 ? `\n阶段拆解（${facts.phases.length} 个阶段，共 ${totalTasks} 个任务）:\n${phaseInfo}` : `\n${phaseInfo}`,
  ].filter(Boolean).join("\n");
};
