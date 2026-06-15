import { getPayloadClient } from "@/lib/payload/client";

import type { DeleteRecordArgs } from "../schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

export const deletePlanFromIntent = async (
  args: DeleteRecordArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  const entityName = args.entityName.trim();
  if (!entityName || entityName.length < 2) {
    return {
      assistantMessage: "请提供要删除的计划名称或 ID。",
      pendingAction: null,
    };
  }

  const payload = await getPayloadClient();

  // 查找计划：先按标题模糊匹配
  const plans = await payload.find({
    collection: "plans",
    depth: 0,
    where: { title: { like: entityName } },
  });

  if (plans.docs.length === 0) {
    return {
      assistantMessage: `未找到标题包含「${entityName}」的计划。请检查计划名称是否正确。`,
      pendingAction: null,
    };
  }

  if (plans.docs.length > 1) {
    const matchList = plans.docs
      .slice(0, 5)
      .map((p) => `· ${p.title} (ID: ${p.id})`)
      .join("\n");
    return {
      assistantMessage: `找到 ${plans.docs.length} 个匹配的计划：\n${matchList}\n\n请指定要删除的具体计划名称或 ID。`,
      pendingAction: null,
    };
  }

  const plan = plans.docs[0] as { agentBrief?: null | string; description?: null | string; domain?: null | string; dueDate?: null | string; executionMode?: string; id: number; phases?: unknown; priority?: string; progress?: null | number; state?: string; title: string; totalEstimatedDays?: null | number; visibility?: string; weeklyRhythm?: unknown };

  onTrace?.({
    detail: `确认删除计划 #${plan.id}「${plan.title}」`,
    id: "tool-delete-plan-confirm",
    kind: "write",
    status: "running",
    title: `准备删除计划「${plan.title}」`,
  });

  // 捕获删除前的完整快照（供回滚恢复）
  const beforeSnapshot = {
    agentBrief: plan.agentBrief ?? null,
    description: plan.description ?? null,
    domain: plan.domain ?? null,
    dueDate: plan.dueDate ?? null,
    executionMode: plan.executionMode ?? "manual",
    phases: (plan as Record<string, unknown>).phases ?? null,
    priority: plan.priority ?? "medium",
    progress: plan.progress ?? null,
    state: plan.state ?? "active",
    title: plan.title,
    totalEstimatedDays: plan.totalEstimatedDays ?? null,
    visibility: plan.visibility ?? "private",
    weeklyRhythm: (plan as Record<string, unknown>).weeklyRhythm ?? null,
  };

  // 执行删除
  const planId = plan.id;
  await payload.delete({
    collection: "plans",
    id: planId,
    overrideAccess: true,
  });

  onTrace?.({
    detail: `已从数据库中删除计划 #${planId}`,
    id: "tool-delete-plan-executed",
    kind: "write",
    status: "done",
    title: `已删除计划「${plan.title}」`,
  });

  // 审计记录
  await createAgentRun({
    affectedDocuments: [
      {
        collection: "plans",
        documentId: planId,
        operation: "delete",
        visibility: (plan.visibility as "private" | "public") ?? "private",
      },
    ],
    afterSnapshot: null,
    beforeSnapshot,
    goal: `删除计划「${plan.title}」`,
    nextAction: null,
    relatedPlan: planId,
    rollbackAvailable: true,
    rollbackPayload: {
      strategy: "restore_deleted_plan",
      target: {
        collection: "plans",
        documentId: planId,
      },
      beforeSnapshot,
    },
    status: "succeeded",
    steps: [{ level: "info", message: `Agent 删除了计划「${plan.title}」` }],
    summary: `Agent 已删除计划「${plan.title}」`,
    title: `Agent deleted plan · ${plan.title}`,
    workflow: "planning",
  });

  return {
    assistantMessage: `已删除计划「${plan.title}」。`,
    pendingAction: null,
    rollbackPayload: {
      strategy: "restore_deleted_plan",
      target: {
        collection: "plans",
        documentId: planId,
      },
      beforeSnapshot,
    },
  };
};
