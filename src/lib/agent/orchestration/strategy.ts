import type { AgentPromptContext } from "../prompts";
import type { AgentExecutionEvaluation, AgentExecutionStrategy, AgentTaskObservation } from "./types";

export type ExecutionStrategyInput = {
  context?: AgentPromptContext;
  evaluation: Omit<AgentExecutionEvaluation, "strategy">;
  observations: AgentTaskObservation[];
};

const defaultStrategy = (): AgentExecutionStrategy => ({
  confidence: 0.5,
  constraints: [],
  memoryIds: [],
  mode: "neutral",
  reason: "没有足够的长期偏好或历史运行信号，沿用当前执行评估。",
  recentRunIds: [],
});

const normalize = (value: string) => value.toLowerCase();

const isConfirmationMemory = (memory: NonNullable<AgentPromptContext["memories"]>[number]) => {
  const text = normalize(`${memory.title} ${memory.content}`);

  return (
    memory.confidence >= 0.5 &&
    memory.type === "workflow_rule" &&
    (
      text.includes("confirm") ||
      text.includes("确认") ||
      text.includes("询问") ||
      text.includes("不要自动") ||
      text.includes("先问")
    )
  );
};

const isAutonomyMemory = (memory: NonNullable<AgentPromptContext["memories"]>[number]) => {
  const text = normalize(`${memory.title} ${memory.content}`);

  return (
    memory.confidence >= 0.5 &&
    (memory.type === "preference" || memory.type === "workflow_rule") &&
    (text.includes("自动") || text.includes("自主") || text.includes("autonomous") || text.includes("auto"))
  );
};

const findRecentFailedRuns = (
  context: AgentPromptContext | undefined,
  observations: AgentTaskObservation[],
) => {
  const failedIntents = getFailedIntents(observations);

  if (failedIntents.size === 0) {
    return [];
  }

  return (context?.agentRuns ?? [])
    .filter((run) => {
      const status = normalize(run.status);
      const text = normalize(`${run.workflow} ${run.title} ${run.summary ?? ""}`);

      return (
        (status.includes("fail") || status.includes("error") || status.includes("failed")) &&
        Array.from(failedIntents).some((intent) => text.includes(intent))
      );
    })
    .slice(0, 3);
};

const getFailedIntents = (observations: AgentTaskObservation[]) =>
  new Set(
    observations
      .filter((observation) => observation.status === "failed" || observation.status === "blocked")
      .map((observation) => observation.intent),
  );

const findStrategyFeedbackMemories = (
  context: AgentPromptContext | undefined,
  observations: AgentTaskObservation[],
) => {
  const failedIntents = getFailedIntents(observations);

  if (failedIntents.size === 0) {
    return [];
  }

  return (context?.memories ?? []).filter((memory) => {
    const text = normalize(`${memory.title} ${memory.content}`);

    return (
      memory.confidence >= 0.5 &&
      memory.type === "workflow_rule" &&
      (
        text.includes("策略反馈") ||
        text.includes("不要直接重复自动重规划") ||
        text.includes("先核对目标") ||
        text.includes("避免重复失败")
      ) &&
      Array.from(failedIntents).some((intent) => text.includes(intent))
    );
  });
};

export const selectExecutionStrategy = (input: ExecutionStrategyInput): AgentExecutionStrategy => {
  const context = input.context;
  const confirmationMemories = (context?.memories ?? []).filter(isConfirmationMemory);

  if (
    confirmationMemories.length > 0 &&
    (input.evaluation.action === "wait_for_confirmation" || input.evaluation.action === "ask_user")
  ) {
    return {
      confidence: 0.92,
      constraints: ["写入前先确认", "避免绕过用户明确的审批偏好"],
      memoryIds: confirmationMemories.map((memory) => memory.id),
      mode: "confirm_first",
      reason: "长期记忆要求写入或修改前先询问并确认。",
      recentRunIds: [],
    };
  }

  const failedRuns = findRecentFailedRuns(context, input.observations);
  const strategyFeedbackMemories = findStrategyFeedbackMemories(context, input.observations);

  if (
    (failedRuns.length >= 2 || strategyFeedbackMemories.length > 0) &&
    (input.evaluation.action === "replan" || input.evaluation.action === "ask_user")
  ) {
    return {
      confidence: strategyFeedbackMemories.length > 0 ? 0.88 : 0.86,
      constraints: [
        "避免重复失败工作流",
        "优先改变参数、缩小范围或询问用户",
        ...(strategyFeedbackMemories.length > 0 ? ["先核对目标对象、参数和上下文"] : []),
      ],
      memoryIds: strategyFeedbackMemories.map((memory) => memory.id),
      mode: "avoid_recent_failure",
      reason: strategyFeedbackMemories.length > 0
        ? "策略反馈记忆提示该工作流已走过失败路径，需要避免沿用相同路径。"
        : "最近同类 AgentRun 多次失败，需要避免沿用相同路径。",
      recentRunIds: failedRuns.map((run) => run.id),
    };
  }

  const autonomyMemories = (context?.memories ?? []).filter(isAutonomyMemory);

  if (autonomyMemories.length > 0 && input.evaluation.action === "complete") {
    return {
      confidence: 0.72,
      constraints: ["低风险完成后可自动收束结果"],
      memoryIds: autonomyMemories.map((memory) => memory.id),
      mode: "autonomous",
      reason: "长期记忆偏好更高自主度，当前没有待确认或失败任务。",
      recentRunIds: [],
    };
  }

  if (input.evaluation.action === "replan") {
    return {
      ...defaultStrategy(),
      confidence: 0.66,
      constraints: ["重规划时保留已成功观察到的文档变更"],
      mode: "cautious_replan",
      reason: "当前需要重规划，但没有足够历史失败信号。",
    };
  }

  return defaultStrategy();
};

export const applyExecutionStrategy = <T extends Omit<AgentExecutionEvaluation, "strategy">>(
  evaluation: T,
  strategy: AgentExecutionStrategy,
): T & { strategy: AgentExecutionStrategy } => {
  if (strategy.mode === "confirm_first") {
    return {
      ...evaluation,
      nextStep: `${evaluation.nextStep} 长期记忆要求写入前先确认。`,
      strategy,
    };
  }

  if (strategy.mode === "avoid_recent_failure") {
    return {
      ...evaluation,
      nextStep: `${evaluation.nextStep} ${
        strategy.memoryIds.length > 0 ? "策略反馈记忆提示：" : ""
      }需要避免重复失败工作流，优先换策略或询问用户。`,
      strategy,
    };
  }

  if (strategy.mode === "cautious_replan") {
    return {
      ...evaluation,
      nextStep: `${evaluation.nextStep} 重规划时必须保留已成功观察到的结果。`,
      strategy,
    };
  }

  return {
    ...evaluation,
    strategy,
  };
};
