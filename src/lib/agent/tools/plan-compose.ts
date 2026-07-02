import { getPayloadClient } from "@/lib/payload/client";

import type { ComposePlanArgs } from "../schemas";
import {
  composePlanProposal,
  composePlanProposalFromDecomposed,
  formatPlanProposalDescription,
} from "../workflows/plan-composer";
import { validatePlanCreateData } from "../write-schemas";
import { createAgentRun, type AgentExecutionTraceReporter, type AgentToolResult } from "../tool-shared";

export const composePlanFromIntent = async (
  args: ComposePlanArgs,
  onTrace?: AgentExecutionTraceReporter,
): Promise<AgentToolResult> => {
  const decomposed = args.decomposed ?? null;
  const proposal = decomposed
    ? composePlanProposalFromDecomposed(args, decomposed)
    : composePlanProposal(args);
  const description = formatPlanProposalDescription(proposal);

  onTrace?.({
    detail: proposal.goal,
    id: "tool-compose-plan-prepare",
    kind: "action",
    status: "running",
    title: `准备创建完整计划「${proposal.title}」`,
  });
  const payload = await getPayloadClient();
  const data = validatePlanCreateData({
    agentBrief: proposal.agentBrief,
    agentState: "ready",
    description,
    domain: args.domain ?? null,
    dueDate: proposal.suggestedDueDate ?? null,
    executionMode: "hybrid",
    phases: decomposed?.phases ?? null,
    prerequisites: decomposed?.prerequisites ?? null,
    priority: proposal.suggestedPriority,
    progress: 0,
    state: "backlog",
    status: "draft",
    title: proposal.title,
    totalEstimatedDays: decomposed?.totalEstimatedDays ?? null,
    visibility: "private",
    weeklyRhythm: decomposed?.weeklyRhythm ?? null,
  });
  const createdPlan = await payload.create({
    collection: "plans",
    data,
    overrideAccess: true,
  });

  const phaseLabel = decomposed
    ? `（${decomposed.phases.length} 个阶段，${decomposed.totalEstimatedDays} 天）`
    : "";

  onTrace?.({
    detail: `已写入 ${proposal.keySteps.length} 个关键步骤、${proposal.nextActions.length} 个下一步动作和 Agent Brief。`,
    id: "tool-compose-plan-created",
    kind: "write",
    status: "done",
    title: `已创建完整计划 #${createdPlan.id}${phaseLabel}`,
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
      phases: decomposed?.phases ?? null,
      proposal,
      title: createdPlan.title,
      totalEstimatedDays: decomposed?.totalEstimatedDays ?? null,
      visibility: createdPlan.visibility,
    },
    beforeSnapshot: null,
    goal: proposal.goal,
    nextAction: proposal.nextActions[0] ?? null,
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
    steps: proposal.keySteps.map((step) => ({
      level: "info",
      message: step,
    })),
    summary: `Agent 已创建完整计划「${createdPlan.title}」${phaseLabel}。`,
    title: `Agent composed plan · ${createdPlan.title}`,
    workflow: "planning",
  });

  onTrace?.({
    detail: "完整计划创建动作已经写入 AgentRun 审计记录。",
    id: "tool-compose-plan-audit",
    kind: "write",
    status: "done",
    title: "已记录审计日志",
  });

  const scheduleHint = decomposed?.phases
    ? `\n\n这个计划包含 ${decomposed.phases.length} 个阶段，共 ${decomposed.totalEstimatedDays} 天。你可以说「把这个计划排进日程」来自动生成每日学习安排。`
    : "";

  return {
    assistantMessage: `已创建完整计划「${createdPlan.title}」。我已经把目标、关键步骤、验收标准、风险和 Agent Brief 写进计划详情。你可以继续把它拆成清单，后续清单会关联到该计划。${scheduleHint}`,
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
