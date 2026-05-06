import type { AgentIntent, ProposedAgentAction } from "./schemas";

import { getPayloadClient } from "@/lib/payload/client";

import { validateAgentRunData } from "./write-schemas";

const workflowByIntent: Record<AgentIntent["intent"], "planning" | "readiness-audit" | "sync"> = {
  add_completion_note: "sync",
  answer_question: "readiness-audit",
  append_plan_item: "planning",
  clarify: "readiness-audit",
  complete_plan_item: "sync",
  create_plan: "planning",
  evaluate_plan: "readiness-audit",
  query_progress: "readiness-audit",
};

export const recordAgentFailure = async ({
  error,
  intent,
  message,
}: {
  error: unknown;
  intent?: AgentIntent["intent"];
  message: string;
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
    workflow: intent ? workflowByIntent[intent] : "readiness-audit",
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
}: {
  action: ProposedAgentAction;
  decision: "canceled" | "confirmed";
  message: string;
}) => {
  const payload = await getPayloadClient();
  const recordedAt = new Date().toISOString();
  const confirmed = decision === "confirmed";
  const data = validateAgentRunData({
    completedAt: recordedAt,
    goal: `${confirmed ? "确认执行" : "取消执行"}：${action.summary}`,
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
    workflow: workflowByIntent[action.intent],
  });

  await payload.create({
    collection: "agent-runs",
    data,
    overrideAccess: true,
  });
};
