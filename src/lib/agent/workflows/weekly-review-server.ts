import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "../execution-context";
import type { AgentTraceStep, WeeklyReviewArgs } from "../schemas";
import { upsertSuggestion } from "../suggestions";
import { validateAgentRunData, validatePlanReviewData } from "../write-schemas";
import { runWeeklyReviewWorkflow, type WeeklyReviewPayload } from "./weekly-review";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

export const executeWeeklyReviewFromIntent = async (
  args: WeeklyReviewArgs,
  onTrace?: AgentExecutionTraceReporter,
) => {
  onTrace?.({
    detail: args.persistReview === false ? "仅生成本周回顾预览，不创建 PlanReview。" : "将读取工作台数据并创建 PlanReview、AgentRun 和建议。",
    id: "workflow-weekly-review",
    kind: "analysis",
    status: "running",
    title: "正在生成本周回顾",
  });

  const payload = await getPayloadClient();
  const result = await runWeeklyReviewWorkflow(args, {
    payload: payload as unknown as WeeklyReviewPayload,
    upsertSuggestion,
    userId: getCurrentAgentUserId(),
    validateAgentRunData,
    validatePlanReviewData,
  });

  onTrace?.({
    detail: result.reviewId ? `PlanReview #${result.reviewId}，AgentRun #${result.agentRunId ?? "n/a"}` : "预览已生成。",
    id: "workflow-weekly-review",
    kind: "complete",
    status: "done",
    title: "本周回顾已生成",
  });

  return {
    assistantMessage: result.assistantMessage,
    pendingAction: null,
  };
};
