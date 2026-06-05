import type { AgentExecutionEvaluation } from "./types";

export type AgentExecutionLoopDirective =
  | {
      action: "proceed";
      reason: string;
    }
  | {
      action: "pause_for_user";
      assistantMessage: string;
      reason: string;
    };

export const buildExecutionLoopDirective = (
  evaluation: AgentExecutionEvaluation,
): AgentExecutionLoopDirective => {
  if (evaluation.action === "replan" && evaluation.strategy.mode === "avoid_recent_failure") {
    const failedCount = evaluation.strategy.recentRunIds.length;

    return {
      action: "pause_for_user",
      assistantMessage: [
        `我检测到最近同类任务已经失败 ${failedCount} 次，因此这次先暂停自动重规划，避免继续重复失败路径。`,
        `失败原因：${evaluation.reason}`,
        "你可以补充更准确的目标对象、调整任务范围，或回复「继续」让我换一种策略重试。",
      ].join("\n"),
      reason: evaluation.strategy.reason,
    };
  }

  return {
    action: "proceed",
    reason: evaluation.strategy.reason,
  };
};
