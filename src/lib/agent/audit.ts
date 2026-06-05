import type { AgentIntent, ProposedAgentAction } from "./schemas";

import { getPayloadClient } from "@/lib/payload/client";

import { validateAgentRunData } from "./write-schemas";

const workflowByIntent: Record<AgentIntent["intent"], "planning" | "readiness-audit" | "sync" | "weekly-review"> = {
  add_completion_note: "sync",
  answer_question: "readiness-audit",
  append_plan_item: "planning",
  clarify: "readiness-audit",
  complete_plan_item: "sync",
  compose_plan: "planning",
  cancel_schedule_item: "planning",
  compose_schedule_item: "planning",
  compose_timeline_event: "sync",
  create_plan: "planning",
  evaluate_plan: "readiness-audit",
  query_plan_progress: "readiness-audit",
  query_progress: "readiness-audit",
  reschedule_item: "planning",
  save_memory: "sync",
  schedule_plan: "planning",
  weekly_review: "weekly-review",
};

export const recordAgentFailure = async ({
  error,
  intent,
  message,
  userId,
}: {
  error: unknown;
  intent?: AgentIntent["intent"];
  message: string;
  userId?: number;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const errorMessage = error instanceof Error ? error.message : "Unknown Agent failure";
  const data = validateAgentRunData({
    completedAt: recordedAt,
    goal: `Agent 处理失败：${message.slice(0, 120)}`,
    startedAt: recordedAt,
    status: "failed",
    steps: [
      {
        level: "error",
        message: errorMessage,
        recordedAt,
      },
    ],
    summary: errorMessage,
    title: intent ? `Agent failed · ${intent}` : "Agent failed",
    trigger: "agent",
    user: userId,
    workflow: intent ? workflowByIntent[intent] : "readiness-audit",
  });

  await payload.create({
    collection: "agent-runs",
    data,
    overrideAccess: true,
  });
};

export const recordAgentRollbackExecuted = async ({
  result,
  rollbackPayload,
  userId,
}: {
  result: {
    affectedDocuments?: Array<{
      collection: string;
      documentId: number;
      operation: "delete" | "update";
      visibility?: "unknown";
    }>;
    collection: string;
    documentId: number;
    summary?: string;
    strategy: string;
  };
  rollbackPayload: unknown;
  userId?: number;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const affectedDocuments = result.affectedDocuments ?? [
    {
      collection: result.collection,
      documentId: result.documentId,
      operation: result.strategy.startsWith("delete_") ? "delete" as const : "update" as const,
      visibility: "unknown" as const,
    },
  ];
  const affectedSummary = affectedDocuments
    .map((document) => `${document.collection}#${document.documentId} ${document.operation}`)
    .join("；");
  const workflow =
    affectedDocuments.some((document) => document.collection === "timeline-events")
      ? "sync"
      : affectedDocuments.some((document) => document.collection === "plans" || document.collection === "schedule-items")
        ? "planning"
        : "readiness-audit";

  const data = validateAgentRunData({
    affectedDocuments,
    afterSnapshot: null,
    beforeSnapshot: {
      note: "rollback_executed",
      rollbackPayload,
      target: result,
    },
    completedAt: recordedAt,
    goal: `用户触发回滚：${result.strategy} · ${affectedSummary}`,
    rollbackAvailable: false,
    rollbackPayload,
    startedAt: recordedAt,
    status: "succeeded",
    steps: [
      {
        level: "warn",
        message: `ROLLBACK_EXECUTED strategy=${result.strategy} affected=${affectedSummary}`,
        recordedAt,
      },
    ],
    summary: result.summary ?? `已执行回滚 ${result.strategy}，影响 ${affectedDocuments.length} 个对象：${affectedSummary}`,
    title: `Agent rollback executed · ${result.strategy}`,
    trigger: "manual",
    user: userId,
    workflow,
  });

  await payload.create({
    collection: "agent-runs",
    context: {
      skipAgentRunPlanSync: true,
    },
    data,
    overrideAccess: true,
  });
};

export const recordBatchConfirmationDecision = async ({
  actions,
  decision,
  message,
  orchestrationId,
  userId,
}: {
  actions: ProposedAgentAction[];
  decision: "canceled" | "confirmed";
  message: string;
  orchestrationId?: string;
  userId?: number;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const confirmed = decision === "confirmed";
  const summaryList = actions.map((action, index) => `${index + 1}. ${action.summary}`).join("；");
  const data = validateAgentRunData({
    completedAt: recordedAt,
    goal: `${confirmed ? "批量确认执行" : "批量取消"}：${actions.length} 项`,
    orchestrationId,
    startedAt: recordedAt,
    status: confirmed ? "succeeded" : "canceled",
    steps: [
      {
        level: confirmed ? "info" : "warn",
        message: `${confirmed ? "用户批量确认" : "用户批量取消"} orchestrationId=${orchestrationId ?? "n/a"} reply=${message.slice(0, 80)} · ${summaryList.slice(0, 240)}`,
        recordedAt,
      },
    ],
    summary: `${confirmed ? "已批量确认" : "已批量取消"} ${actions.length} 项操作`,
    title: `Agent batch confirmation ${decision}`,
    trigger: "agent",
    user: userId,
    workflow: "automation",
  });

  await payload.create({
    collection: "agent-runs",
    context: {
      skipAgentRunPlanSync: true,
    },
    data,
    overrideAccess: true,
  });
};

export const recordAutoApproval = async ({
  action,
  reason,
  threadId,
  userId,
}: {
  action: ProposedAgentAction;
  reason: string;
  threadId: number;
  userId?: number;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const data = validateAgentRunData({
    affectedDocuments: action.affectedDocuments,
    afterSnapshot: action.afterSnapshot,
    beforeSnapshot: action.beforeSnapshot,
    completedAt: recordedAt,
    goal: `自动批准：${action.summary}`,
    rollbackAvailable: action.rollbackAvailable ?? false,
    rollbackPayload: action.rollbackPayload,
    startedAt: recordedAt,
    status: "succeeded",
    steps: [
      {
        level: "info",
        message: `AUTO_APPROVED action=${action.id} intent=${action.intent} risk=${action.riskLevel} reason=${reason} threadId=${threadId}`,
        recordedAt,
      },
    ],
    summary: `自动批准并执行：${action.summary}`,
    title: `Agent auto-approved · ${action.intent}`,
    trigger: "agent",
    user: userId,
    workflow: workflowByIntent[action.intent],
  });

  await payload.create({
    collection: "agent-runs",
    data,
    overrideAccess: true,
  });
};

export const recordAgentConfirmationDecision = async ({
  action,
  decision,
  message,
  userId,
}: {
  action: ProposedAgentAction;
  decision: "canceled" | "confirmed";
  message: string;
  userId?: number;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const confirmed = decision === "confirmed";
  const data = validateAgentRunData({
    affectedDocuments: action.affectedDocuments,
    afterSnapshot: action.afterSnapshot,
    beforeSnapshot: action.beforeSnapshot,
    completedAt: recordedAt,
    goal: `${confirmed ? "确认执行" : "取消执行"}：${action.summary}`,
    rollbackAvailable: action.rollbackAvailable ?? false,
    rollbackPayload: action.rollbackPayload,
    startedAt: recordedAt,
    status: confirmed ? "succeeded" : "canceled",
    steps: [
      {
        level: confirmed ? "info" : "warn",
        message: `${confirmed ? "用户确认" : "用户取消"} proposedAction=${action.id} intent=${action.intent} risk=${action.riskLevel} reply=${message.slice(0, 80)}`,
        recordedAt,
      },
    ],
    summary: `${confirmed ? "已确认" : "已取消"}待执行动作：${action.summary}`,
    title: `Agent confirmation ${decision} · ${action.intent}`,
    trigger: "agent",
    user: userId,
    workflow: workflowByIntent[action.intent],
  });

  await payload.create({
    collection: "agent-runs",
    data,
    overrideAccess: true,
  });
};
