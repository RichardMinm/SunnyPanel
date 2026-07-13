import { toProgressPercent } from "./facts";
import type { QueryFacts } from "./types";

export const renderCanonicalFactBlock = (facts: QueryFacts) => {
  if (facts.kind === "aggregate_progress") {
    const summary = facts.snapshot.summary;
    const planFacts = `当前 ${summary.planCount} 项计划，进行中 ${summary.activePlans}，已完成 ${summary.completedPlans}`;
    const checklistFacts = `清单条目完成 ${summary.completedChecklistItems}/${summary.totalChecklistItems}（${toProgressPercent(summary.completedChecklistItems, summary.totalChecklistItems)}%）`;
    if (facts.args.scope === "plans") return `\n\n事实：${planFacts}。`;
    if (facts.args.scope === "checklists") return `\n\n事实：${checklistFacts}。`;
    return `\n\n事实：${planFacts}；${checklistFacts}。`;
  }
  const phaseTasks = facts.phases.reduce((sum, phase) => sum + phase.taskCount, 0);
  const storedProgress = facts.storedProgressPercent === null ? "未记录" : `${facts.storedProgressPercent}%`;
  return `\n\n事实：计划「${facts.title}」状态为 ${facts.state}，存储进度${storedProgress === "未记录" ? "" : " "}${storedProgress}，共 ${facts.phases.length} 个阶段、${phaseTasks} 个任务。`;
};
