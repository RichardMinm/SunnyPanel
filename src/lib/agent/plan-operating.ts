import type { Plan } from "@/payload-types";

import { validateAgentRunData, validatePlanReviewData } from "./write-schemas";

export type PlanOperatingEvaluation = {
  assistantMessage: string;
  health: "attention" | "healthy" | "risk";
  metrics: Record<string, number | string>;
  planId?: number;
  planTitle?: string;
  recommendations: string[];
  reviewId?: number;
  scope: "overall" | "plan";
};

export type PlanOperatingPersistedResult = PlanOperatingEvaluation & {
  agentRunId?: number;
  nextAction?: string;
  projectedAgentState?: NonNullable<Plan["agentState"]>;
  reviewId?: number;
};

type CreateResult = {
  id: number;
};
type AgentRunCreateData = ReturnType<typeof validateAgentRunData>;
type PlanReviewCreateData = ReturnType<typeof validatePlanReviewData>;

export type PlanOperatingPersistenceDeps = {
  createAgentRun: (
    data: AgentRunCreateData,
    context?: { skipAgentRunPlanSync: true },
  ) => Promise<CreateResult>;
  createPlanReview: (data: PlanReviewCreateData) => Promise<CreateResult>;
  now?: string;
  updatePlan?: (
    id: number,
    data: Pick<Plan, "agentState" | "lastAgentRun">,
  ) => Promise<void>;
  userId?: number;
};

const getRecordedAt = (now?: string) => {
  if (now && !Number.isNaN(Date.parse(now))) {
    return now;
  }

  return new Date().toISOString();
};

const inferProjectedAgentState = (
  evaluation: PlanOperatingEvaluation,
): NonNullable<Plan["agentState"]> | undefined => {
  if (evaluation.scope !== "plan" || !evaluation.planId) {
    return undefined;
  }

  if (
    evaluation.health === "risk" ||
    evaluation.recommendations.some((item) =>
      /阻塞|失败|逾期|缺少|还缺|需要补|补齐/i.test(item),
    )
  ) {
    return "blocked";
  }

  return "review";
};

const buildNextAction = (evaluation: PlanOperatingEvaluation) =>
  evaluation.recommendations[0]?.trim() ||
  (evaluation.scope === "plan"
    ? "复核这次评估结果，并决定是否进入下一步执行。"
    : "复核整体评估结果，并选择一个最小推进动作。");

const buildReviewTitle = (
  evaluation: PlanOperatingEvaluation,
  recordedAt: string,
) =>
  evaluation.scope === "plan" && evaluation.planTitle
    ? `Plan Review · ${evaluation.planTitle}`
    : `Plan Review · Overall · ${recordedAt.slice(0, 10)}`;

export const persistPlanOperatingReview = async (
  evaluation: PlanOperatingEvaluation,
  deps: PlanOperatingPersistenceDeps,
): Promise<PlanOperatingPersistedResult> => {
  if (
    Object.keys(evaluation.metrics).length === 0 ||
    evaluation.recommendations.length === 0
  ) {
    return evaluation;
  }

  const recordedAt = getRecordedAt(deps.now);
  const title = buildReviewTitle(evaluation, recordedAt);
  const nextAction = buildNextAction(evaluation);
  const reviewData = validatePlanReviewData({
    health: evaluation.health,
    metrics: evaluation.metrics,
    plan: evaluation.scope === "plan" ? evaluation.planId : undefined,
    recommendations: evaluation.recommendations.map((content) => ({
      content,
    })),
    reviewedAt: recordedAt,
    scope: evaluation.scope,
    source: "agent",
    summary: evaluation.assistantMessage,
    title,
  });
  const review = await deps.createPlanReview(reviewData);
  const projectedAgentState = inferProjectedAgentState(evaluation);
  const affectedDocuments =
    evaluation.scope === "plan" && evaluation.planId
      ? [
          {
            collection: "plans",
            documentId: evaluation.planId,
            operation: "update",
            visibility: "unknown",
          },
        ]
      : undefined;
  const agentRunData = validateAgentRunData({
    ...(affectedDocuments ? { affectedDocuments } : {}),
    afterSnapshot: projectedAgentState
      ? { agentState: projectedAgentState }
      : undefined,
    completedAt: recordedAt,
    goal:
      evaluation.scope === "plan" && evaluation.planTitle
        ? `评估并推进计划：${evaluation.planTitle}`
        : "评估整体计划状态",
    nextAction,
    relatedContent: [
      {
        relationTo: "plan-reviews",
        value: review.id,
      },
    ],
    relatedPlan:
      evaluation.scope === "plan" ? evaluation.planId : undefined,
    startedAt: recordedAt,
    status: "succeeded",
    steps: [
      {
        level: evaluation.health === "risk" ? "warn" : "info",
        message: `PLAN_OPERATING_AUDIT health=${evaluation.health} next=${nextAction}`,
        recordedAt,
      },
    ],
    summary: evaluation.assistantMessage,
    title,
    trigger: "agent",
    user: deps.userId,
    workflow: "readiness-audit",
  });
  const agentRun = await deps.createAgentRun(agentRunData, {
    skipAgentRunPlanSync: true,
  });

  if (projectedAgentState && evaluation.planId && deps.updatePlan) {
    await deps.updatePlan(evaluation.planId, {
      agentState: projectedAgentState,
      lastAgentRun: agentRun.id,
    });
  }

  return {
    ...evaluation,
    agentRunId: agentRun.id,
    nextAction,
    projectedAgentState,
    reviewId: review.id,
  };
};
