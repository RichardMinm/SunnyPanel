import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "../execution-context";
import type { AgentTraceStep, WeeklyReviewArgs } from "../schemas";
import { upsertSuggestion } from "../suggestions";
import { createOwnedRollbackToolResult } from "../tool-shared";
import { validateAgentRunData, validatePlanReviewData } from "../write-schemas";
import {
  buildWeeklyReviewRollbackPayload,
  runWeeklyReviewWorkflow,
  type WeeklyReviewPayload,
} from "./weekly-review";

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

  const rollbackPayload = result.reviewId
    ? buildWeeklyReviewRollbackPayload({
        planReviewId: result.reviewId,
        suggestionIds: result.suggestionIds,
      })
    : undefined;
  const rollbackSourceRunId =
    typeof result.agentRunId === "number"
    && Number.isSafeInteger(result.agentRunId)
    && result.agentRunId > 0
      ? result.agentRunId
      : undefined;

  if (rollbackPayload && !rollbackSourceRunId) {
    onTrace?.({
      detail: `PlanReview #${result.reviewId} 已写入，但没有可用的 AgentRun 回滚来源。`,
      id: "workflow-weekly-review",
      kind: "error",
      status: "error",
      title: "本周回顾回滚来源不可用",
    });

    return {
      assistantMessage: `${result.assistantMessage}\n\n本周回顾已写入，但 AgentRun 回滚来源不可用；本次执行已按安全策略标记失败，需要人工核查。`,
      pendingAction: null,
      status: "failed" as const,
    };
  }

  onTrace?.({
    detail: result.reviewId ? `PlanReview #${result.reviewId}，AgentRun #${rollbackSourceRunId}` : "预览已生成。",
    id: "workflow-weekly-review",
    kind: "complete",
    status: "done",
    title: "本周回顾已生成",
  });

  if (rollbackPayload && rollbackSourceRunId) {
    return createOwnedRollbackToolResult({
      assistantMessage: result.assistantMessage,
      pendingAction: null,
      rollbackPayload,
      rollbackSourceRunId,
    });
  }

  return {
    assistantMessage: result.assistantMessage,
    pendingAction: null,
  };
};
