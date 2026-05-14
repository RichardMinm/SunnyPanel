import type { Payload } from "payload";

import { buildAgentContext, DEFAULT_AGENT_CONTEXT_BUDGET } from "@/lib/agent/context-builder";
import type { ContextPreferences } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import { getRelevantMemories } from "@/lib/agent/memory";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { AgentChatResponse, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { createTokenUsageSnapshot, estimateTokenCount } from "@/lib/agent/token-usage";
import { getAgentWorkspaceContextSource } from "@/lib/payload/workspace";

export type BuildContextStepParams = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences;
  emitStatus: (status: string) => void;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  message: string;
  payload: Payload;
  pendingAction: null | PendingAction;
  pushTrace: (step: AgentTraceStep) => void;
  workbenchMode?: AgentWorkbenchMode | null;
};

export type BuildContextStepResult = {
  context: ReturnType<typeof buildAgentContext>;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

/**
 * 并行拉取工作台上下文源与相关记忆，再合成 buildAgentContext 结果。
 * 与 chat route 原 L453–468 对齐，供 run-agent-chat-pipeline 单点调用。
 */
export const runBuildContextStep = async ({
  baseTokenUsage,
  contextPreferences,
  emitStatus,
  emitUsage,
  message,
  payload,
  pendingAction,
  pushTrace,
  workbenchMode,
}: BuildContextStepParams): Promise<BuildContextStepResult> => {
  emitStatus("正在加载工作区数据...");
  pushTrace({
    detail: "准备按消息意图读取计划、清单、内容、时间线、AgentRun 和 PlanReview。",
    id: "context-bootstrap",
    kind: "context",
    status: "running",
    title: "正在建立上下文",
  });
  const [contextSource, memories] = await Promise.all([
    getAgentWorkspaceContextSource({
      budget: DEFAULT_AGENT_CONTEXT_BUDGET,
      payload,
    }),
    getRelevantMemories(message, 6),
  ]);
  const context = buildAgentContext({
    budget: DEFAULT_AGENT_CONTEXT_BUDGET,
    contextPreferences: contextPreferences ?? undefined,
    message,
    pendingAction,
    source: {
      ...contextSource,
      memories,
    },
    workbenchMode: workbenchMode ?? undefined,
  });
  const tokenUsage = createTokenUsageSnapshot({
    contextTokens: baseTokenUsage.contextTokens + estimateTokenCount(context),
    inputTokens: baseTokenUsage.inputTokens,
  });
  emitUsage(tokenUsage);
  const memoryTitles = (context.memories ?? []).map((m) => m.title);
  const memoryNote = memoryTitles.length > 0 ? `\n命中记忆：${memoryTitles.join("、")}` : "";
  pushTrace({
    detail: `mode=${context.mode ?? "general"}，纳入 ${context.memories?.length ?? 0} 条长期记忆、${context.plans.length} 条计划、${context.checklists.length} 份清单、${context.contentItems?.length ?? 0} 条内容、${context.timelineEvents?.length ?? 0} 个时间线节点、${context.agentRuns?.length ?? 0} 条 AgentRun、${context.planReviews?.length ?? 0} 条 PlanReview。${memoryNote}`,
    id: "context-bootstrap",
    kind: "context",
    status: "done",
    title: "上下文已就绪",
  });

  return { context, tokenUsage };
};
