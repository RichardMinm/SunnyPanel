import type { Plan } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import type { QueryPlanProgressArgs } from "../schemas";
import type { AgentToolResult } from "../tool-shared";

export const queryPlanProgressFromIntent = async (
  args: QueryPlanProgressArgs,
): Promise<AgentToolResult> => {
  const payload = await getPayloadClient();

  let plan: Plan | null = null;
  if (args.planId) {
    plan = await payload.findByID({
      collection: "plans",
      id: args.planId,
      overrideAccess: true,
    });
  } else if (args.planTitle) {
    const result = await payload.find({
      collection: "plans",
      depth: 0,
      limit: 10,
      overrideAccess: true,
      sort: "-updatedAt",
    });
    const query = args.planTitle.toLowerCase();
    plan =
      result.docs.find(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          query.includes(p.title.toLowerCase()),
      ) ?? null;
  }

  if (!plan) {
    return {
      assistantMessage: "找不到对应的计划。请告诉我计划的标题或 ID。",
      pendingAction: null,
    };
  }

  const phases = plan.phases as
    | Array<{ title: string; goal: string; estimatedDays: number; milestones: Array<{ title: string; tasks: string[]; estimatedHours: number }> }>
    | null
    | undefined;

  const phaseInfo = phases && Array.isArray(phases)
    ? phases
        .map(
          (p, i) =>
            `  阶段${i + 1}「${p.title}」: ${p.goal}（预计${p.estimatedDays}天，${p.milestones?.length ?? 0}个里程碑）`,
        )
        .join("\n")
    : "（暂无阶段拆解数据）";

  const totalTasks = phases
    ? phases.reduce((sum, p) => sum + (p.milestones?.reduce((s, m) => s + (m.tasks?.length ?? 0), 0) ?? 0), 0)
    : 0;

  return {
    assistantMessage: [
      `计划「${plan.title}」`,
      `状态: ${plan.state} | 优先级: ${plan.priority} | 执行模式: ${plan.executionMode}`,
      plan.totalEstimatedDays ? `预计总天数: ${plan.totalEstimatedDays} 天` : null,
      plan.progress != null ? `当前进度: ${plan.progress}%` : null,
      plan.weeklyRhythm ? `学习节奏: ${plan.weeklyRhythm}` : null,
      plan.dueDate ? `截止日期: ${plan.dueDate}` : null,
      phases && Array.isArray(phases) && phases.length > 0
        ? `\n阶段拆解（${phases.length} 个阶段，共 ${totalTasks} 个任务）:\n${phaseInfo}`
        : `\n${phaseInfo}`,
    ]
      .filter(Boolean)
      .join("\n"),
    pendingAction: null,
  };
};
