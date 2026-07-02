import type { AgentRun, Plan } from "@/payload-types";

import { getPayloadClient } from "@/lib/payload/client";

import { enhanceEvaluationWithLLM, mergeEvaluationEnhancement } from "./evaluation-llm";
import { getCurrentAgentUserId } from "./execution-context";
import { persistPlanOperatingReview } from "./plan-operating";
import { calculatePlanChecklistProgress } from "./planning/plan-checklist-progress";
import type { EvaluatePlanArgs } from "./schemas";
import { getAgentProgressSnapshot } from "./progress";

type EvaluationResult = {
  assistantMessage: string;
  health: "attention" | "healthy" | "risk";
  metrics: Record<string, number | string>;
  planId?: number;
  planTitle?: string;
  recommendations: string[];
  reviewId?: number;
  scope: "overall" | "plan";
};

const dayInMs = 1000 * 60 * 60 * 24;

import { scoreTextMatch } from "./tool-shared";

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

const formatPercent = (value: number) => `${Math.round(value * 100)}%`;

const getLinkedContentCount = (plan: Plan) => plan.linkedContent?.length ?? 0;

const getLastRunStatus = (plan: Plan) => {
  const run = plan.lastAgentRun;

  if (run && typeof run === "object" && "status" in run) {
    return (run as AgentRun).status;
  }

  return null;
};

const resolvePlan = (plans: Plan[], args: EvaluatePlanArgs) => {
  if (args.planId) {
    return plans.find((plan) => plan.id === args.planId) ?? null;
  }

  if (!args.planTitle) {
    return null;
  }

  const matches = plans
    .map((plan) => ({
      plan,
      score: scoreTextMatch(plan.title, args.planTitle ?? ""),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  return matches[0]?.plan ?? null;
};

const persistPlanReview = async (result: EvaluationResult) => {
  const payload = await getPayloadClient();
  return persistPlanOperatingReview(result, {
    createAgentRun: async (data, context) =>
      payload.create({
        collection: "agent-runs",
        context,
        data,
        overrideAccess: true,
      }),
    createPlanReview: async (data) =>
      payload.create({
        collection: "plan-reviews",
        data,
        overrideAccess: true,
      }),
    updatePlan: async (id, data) => {
      await payload.update({
        collection: "plans",
        data,
        depth: 0,
        id,
        overrideAccess: true,
      });
    },
    userId: getCurrentAgentUserId(),
  });
};

/**
 * 在规则评估之上叠加 LLM 语义增强（summary/recommendations）。LLM 不可用或失败时原样返回规则结论。
 */
const applyEvaluationEnhancement = async (result: EvaluationResult): Promise<EvaluationResult> => {
  if (result.recommendations.length === 0) {
    return result;
  }

  try {
    const enhancement = await enhanceEvaluationWithLLM({
      health: result.health,
      metrics: result.metrics,
      recommendations: result.recommendations,
      scope: result.scope,
      summary: result.assistantMessage,
    });
    const merged = mergeEvaluationEnhancement(
      {
        health: result.health,
        metrics: result.metrics,
        recommendations: result.recommendations,
        scope: result.scope,
        summary: result.assistantMessage,
      },
      enhancement,
    );

    return {
      ...result,
      assistantMessage: merged.summary,
      recommendations: merged.recommendations,
    };
  } catch {
    return result;
  }
};

const buildOverallEvaluation = async (): Promise<EvaluationResult> => {
  const snapshot = await getAgentProgressSnapshot();
  const { summary } = snapshot;
  const recommendations: string[] = [];

  if (summary.overduePlans > 0) {
    recommendations.push(`先处理 ${summary.overduePlans} 项已逾期计划，至少把截止时间或下一步动作重新定清楚。`);
  }

  if (summary.dueSoonPlans > 0) {
    recommendations.push(`${summary.dueSoonPlans} 项计划 7 天内到期，适合今天拆出一个最小可完成动作。`);
  }

  if (summary.activePlans > 4) {
    recommendations.push("进行中计划偏多，建议收窄到 2-3 项主线，避免上下文切换吞掉推进力。");
  }

  if (summary.overallChecklistCompletionRate < 0.35 && summary.totalChecklistItems >= 5) {
    recommendations.push("清单完成率偏低，先挑一份清单推进到 50% 以上，会比继续铺新项更稳。");
  }

  if (summary.highPriorityPlans > 3) {
    recommendations.push("高优先级计划数量偏多，建议重新排序，只保留真正影响本周结果的高优先级。");
  }

  if (recommendations.length === 0) {
    recommendations.push("整体节奏健康。下一步可以优先补 Timeline 节点或把私有产出整理成公开内容。");
  }

  const health =
    summary.overduePlans > 0 || (summary.overallChecklistCompletionRate < 0.2 && summary.totalChecklistItems >= 5)
      ? "risk"
      : summary.dueSoonPlans > 0 || summary.activePlans > 4 || summary.highPriorityPlans > 3
        ? "attention"
        : "healthy";

  return {
    assistantMessage: `整体评估：${summary.planCount} 项计划中，进行中 ${summary.activePlans}，已完成 ${summary.completedPlans}；清单完成率 ${formatPercent(
      summary.overallChecklistCompletionRate,
    )}。建议：${recommendations.join(" ")}`,
    health,
    metrics: {
      activePlans: summary.activePlans,
      checklistCompletionRate: formatPercent(summary.overallChecklistCompletionRate),
      completedPlans: summary.completedPlans,
      dueSoonPlans: summary.dueSoonPlans,
      overduePlans: summary.overduePlans,
      planCount: summary.planCount,
    },
    recommendations,
    scope: "overall",
  };
};

export const evaluatePlan = async (
  args: EvaluatePlanArgs = {},
  options: {
    persistReview?: boolean;
  } = {},
): Promise<EvaluationResult> => {
  if (!args.planId && !args.planTitle) {
    const result = await applyEvaluationEnhancement(await buildOverallEvaluation());

    return options.persistReview ? persistPlanReview(result) : result;
  }

  const payload = await getPayloadClient();
  const [plans, checklists] = await Promise.all([
    payload.find({
      collection: "plans",
      depth: 1,
      limit: 100,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
    payload.find({
      collection: "checklists",
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: "-updatedAt",
    }),
  ]);
  const plan = resolvePlan(plans.docs, args);

  if (!plan) {
    const target = args.planTitle ? `「${args.planTitle}」` : `#${args.planId}`;

    return {
      assistantMessage: `我没找到 ${target} 这项计划。你可以给我更准确的计划标题，或直接说“评估整体计划”。`,
      health: "attention",
      metrics: {},
      recommendations: [],
      scope: "plan",
    };
  }

  const checklistStats = calculatePlanChecklistProgress({
    checklists: checklists.docs,
    linkedContent: plan.linkedContent ?? null,
  });
  const checklistCompletionRate = checklistStats.completionRate / 100;
  const linkedContentCount = getLinkedContentCount(plan);
  const dueDayOffset = getDueDayOffset(plan.dueDate);
  const lastRunStatus = getLastRunStatus(plan);
  const recommendations: string[] = [];

  if (plan.state !== "done" && dueDayOffset !== null && dueDayOffset < 0) {
    recommendations.push(`这项计划已逾期 ${Math.abs(dueDayOffset)} 天，建议先更新截止时间或缩小范围。`);
  }

  if (plan.state === "active" && linkedContentCount === 0) {
    recommendations.push("它正在推进但还没有关联产出，建议先补一条文章、动态、清单或时间线节点作为可见成果。");
  }

  if ((plan.executionMode === "agent" || plan.executionMode === "hybrid") && !plan.agentBrief) {
    recommendations.push("这项计划启用了 Agent 协作，但还缺 Agent Brief，自动执行前需要补目标、输入边界和完成标准。");
  }

  if (plan.agentState === "blocked") {
    recommendations.push("Agent 状态是阻塞，优先回看最近 Agent Run 的失败原因，再决定是补上下文还是改执行模式。");
  }

  if (lastRunStatus === "failed") {
    recommendations.push("最近一次 Agent Run 失败，建议先处理失败日志中的具体步骤。");
  }

  if (plan.priority === "high" && !plan.dueDate && plan.state !== "done") {
    recommendations.push("高优先级计划没有截止时间，建议补一个日期，方便进度统计和提醒。");
  }

  if (checklistStats.totalItems > 0 && checklistCompletionRate < 0.5 && plan.state === "active") {
    recommendations.push("关联清单完成率还不到 50%，建议先挑最小的一组任务清掉，别急着扩范围。");
  }

  if (recommendations.length === 0) {
    recommendations.push("这项计划指标比较稳，下一步适合沉淀阶段成果或把完成记录同步进 Timeline。");
  }

  const hasHardRisk = plan.state !== "done" && ((dueDayOffset !== null && dueDayOffset < 0) || plan.agentState === "blocked" || lastRunStatus === "failed");
  const health = hasHardRisk
    ? "risk"
    : recommendations.some((item) => item.includes("建议") || item.includes("缺") || item.includes("不到"))
      ? "attention"
      : "healthy";

  const dueText =
    dueDayOffset === null
      ? "未设置截止时间"
      : dueDayOffset < 0
        ? `已逾期 ${Math.abs(dueDayOffset)} 天`
        : dueDayOffset === 0
          ? "今天到期"
          : `${dueDayOffset} 天后到期`;

  const baseResult: EvaluationResult = {
    assistantMessage: `「${plan.title}」评估：状态 ${plan.state}，优先级 ${plan.priority}，${dueText}，关联产出 ${linkedContentCount} 条，关联清单完成率 ${formatPercent(
      checklistCompletionRate,
    )}。建议：${recommendations.join(" ")}`,
    health,
    metrics: {
      agentState: plan.agentState,
      checklistCompletionRate: formatPercent(checklistCompletionRate),
      completedChecklistItems: checklistStats.completedItems,
      dueDayOffset: dueDayOffset ?? "none",
      executionMode: plan.executionMode,
      linkedContentCount,
      priority: plan.priority,
      state: plan.state,
      totalChecklistItems: checklistStats.totalItems,
    },
    planId: plan.id,
    planTitle: plan.title,
    recommendations,
    scope: "plan",
  };
  const result = await applyEvaluationEnhancement(baseResult);

  return options.persistReview ? persistPlanReview(result) : result;
};

export const evaluatePlanFromIntent = async (args: EvaluatePlanArgs) => {
  const result = await evaluatePlan(args, {
    persistReview: true,
  });

  return {
    assistantMessage: result.reviewId
      ? `${result.assistantMessage} 我已经把这次评估保存为 PlanReview #${result.reviewId}。`
      : result.assistantMessage,
    pendingAction: null,
  };
};
