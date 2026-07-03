import { getPayloadClient } from "@/lib/payload/client";

import type { CreatePlanArgs } from "../schemas";
import { validatePlanCreateData } from "../write-schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

export const createPlanFromIntent = async (
  args: CreatePlanArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  onTrace?.({
    detail: args.description ?? "没有额外描述，稍后可在计划详情里补充。",
    id: "tool-create-plan-prepare",
    kind: "action",
    status: "running",
    title: `准备创建计划「${args.title}」`,
  });
  const payload = await getPayloadClient();
  const data = validatePlanCreateData({
    agentBrief: args.agentBrief ?? null,
    agentState: args.executionMode === "agent" ? "ready" : "idle",
    description: args.description ?? null,
    dueDate: args.dueDate ?? null,
    executionMode: args.executionMode ?? "manual",
    priority: args.priority ?? "medium",
    state: args.state ?? "backlog",
    status: "draft",
    title: args.title,
    visibility: "private",
  });
  const createdPlan = await payload.create({
    collection: "plans",
    data,
    overrideAccess: true,
  });
  onTrace?.({
    detail: `计划已写入草稿区，默认执行模式为 ${data.executionMode === "agent" ? "Agent 主导" : data.executionMode === "hybrid" ? "协作推进" : "人工推进"}。`,
    id: "tool-create-plan-created",
    kind: "write",
    status: "done",
    title: `已创建计划记录 #${createdPlan.id}`,
  });

  await createAgentRun({
    affectedDocuments: [
      {
        collection: "plans",
        documentId: createdPlan.id,
        operation: "create",
        visibility: createdPlan.visibility,
      },
    ],
    afterSnapshot: {
      id: createdPlan.id,
      priority: createdPlan.priority,
      state: createdPlan.state,
      title: createdPlan.title,
      visibility: createdPlan.visibility,
    },
    beforeSnapshot: null,
    relatedPlan: createdPlan.id,
    rollbackAvailable: true,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: {
        collection: "plans",
        documentId: createdPlan.id,
      },
    },
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `创建计划：${createdPlan.title}`,
      },
    ],
    summary: `Agent 已创建计划「${createdPlan.title}」。`,
    title: `Agent created plan · ${createdPlan.title}`,
    workflow: "planning",
  });
  onTrace?.({
    detail: "本次创建动作已经写入 AgentRun 审计记录。",
    id: "tool-create-plan-audit",
    kind: "write",
    status: "done",
    title: "已记录审计日志",
  });

  return {
    assistantMessage: `已帮你创建计划「${createdPlan.title}」。目前它会以私有草稿的形式进入待办队列，默认状态是“待开始”。你可以继续把它拆成清单，后续清单会关联到该计划。`,
    createdPlanId: createdPlan.id,
    pendingAction: null,
    planId: createdPlan.id,
    rollbackPayload: {
      strategy: "delete_created_document",
      target: {
        collection: "plans",
        documentId: createdPlan.id,
      },
    },
    status: "completed",
  };
};
