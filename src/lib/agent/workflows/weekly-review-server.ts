import { getPayloadClient } from "@/lib/payload/client";

import { getCurrentAgentUserId } from "../execution-context";
import type { AgentTraceStep, WeeklyReviewArgs } from "../schemas";
import { createOwnedRollbackToolResult } from "../tool-shared";
import { validateAgentRunData, validatePlanReviewData } from "../write-schemas";
import { frozenWeeklyReviewProposalSchema } from "../review/model-schemas";
import type { ReviewModelInvocationOptions } from "../review/model-invocation";
import {
  buildWeeklyReviewRollbackPayload,
  runWeeklyReviewWorkflow,
  type WeeklyReviewPayload,
} from "./weekly-review";

type AgentExecutionTraceReporter = (step: AgentTraceStep) => void;

type WeeklyReviewExecutionOptions = {
  reviewModelInvocation?: ReviewModelInvocationOptions;
};

export const executeWeeklyReviewFromIntent = async (
  args: WeeklyReviewArgs,
  onTrace?: AgentExecutionTraceReporter,
  options: WeeklyReviewExecutionOptions = {},
) => {
  const proposal = frozenWeeklyReviewProposalSchema.safeParse(args.proposal);
  if (args.persistReview !== false && !proposal.success) {
    return {
      assistantMessage: "这次周复盘没有可验证的确认草案，未保存任何内容。请重新生成回顾预览后再确认。",
      pendingAction: null,
      status: "failed" as const,
    };
  }

  onTrace?.({
    detail: args.persistReview === false ? "仅生成本周回顾预览，不保存内容。" : "将保存已确认的本周复盘和行动建议。",
    id: "workflow-weekly-review",
    kind: "analysis",
    status: "running",
    title: "正在生成本周回顾",
  });

  const payload = await getPayloadClient();
  const result = await runWeeklyReviewWorkflow(args, {
    payload: payload as unknown as WeeklyReviewPayload,
    reviewModelInvocation: options.reviewModelInvocation,
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
      detail: `复盘记录 #${result.reviewId} 已保存，但缺少可用的撤销审计记录。`,
      id: "workflow-weekly-review",
      kind: "error",
      status: "error",
      title: "本周回顾回滚来源不可用",
    });

    return {
      assistantMessage: `${result.assistantMessage}\n\n复盘内容已保存，但撤销审计记录不完整；本次执行已按安全策略标记失败，需要人工核查。`,
      pendingAction: null,
      status: "failed" as const,
    };
  }

  onTrace?.({
    detail: result.reviewId ? "复盘内容和运行记录已保存。" : "预览已生成。",
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
