import type { Payload } from "payload";

import { buildAgentContext, DEFAULT_AGENT_CONTEXT_BUDGET } from "@/lib/agent/context-builder";
import type { ContextPreferences } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import { buildSharedContextSnapshot } from "@/lib/agent/shared-context";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { StreamTokenCallback } from "@/lib/agent/client";
import type { AgentChatResponse, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import type { AgentPromptThreadSummary } from "@/lib/agent/thread-summary";
import { createTokenUsageSnapshot, estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import { getAgentWorkspaceContextSource } from "@/lib/payload/workspace";
import type { AgentStreamController } from "@/lib/agent/stream-events";

export type BuildContextStepParams = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  message: string;
  payload: Payload;
  pendingAction: null | PendingAction;
  pushTrace: (step: AgentTraceStep) => void;
  stream?: AgentStreamController;
  streamStageId?: string;
  threadSummary?: AgentPromptThreadSummary | null;
  workbenchMode?: AgentWorkbenchMode | null;
};

export type BuildContextStepResult = {
  context: ReturnType<typeof buildAgentContext>;
  contextSummary: string;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  workingMemory: import("@/lib/agent/shared-context").WorkingMemory;
};

/**
 * 并行拉取工作台上下文源与相关记忆，再合成 buildAgentContext 结果。
 * 与 chat route 原 L453–468 对齐，供 run-agent-chat-pipeline 单点调用。
 */
export const runBuildContextStep = async ({
  baseTokenUsage,
  contextPreferences,
  emitStatus,
  emitToken,
  emitUsage,
  message,
  payload,
  pendingAction,
  pushTrace,
  stream,
  streamStageId = "stage-context",
  threadSummary,
  workbenchMode,
}: BuildContextStepParams): Promise<BuildContextStepResult> => {
  emitStatus("正在加载工作区数据...");
  stream?.progress({
    detail: "准备按预算读取工作台上下文源和共享记忆。",
    message: "连接上下文源",
    stageId: streamStageId,
  });
  pushTrace({
    detail: "准备按消息意图读取计划、清单、内容、时间线、AgentRun 和 PlanReview。",
    id: "context-bootstrap",
    kind: "context",
    status: "running",
    title: "正在建立上下文",
  });
  const contextSource = await getAgentWorkspaceContextSource({
    budget: DEFAULT_AGENT_CONTEXT_BUDGET,
    payload,
  });
  const baseContext = buildAgentContext({
    budget: DEFAULT_AGENT_CONTEXT_BUDGET,
    contextPreferences: contextPreferences ?? undefined,
    message,
    pendingAction,
    source: {
      ...contextSource,
      memories: [],
    },
    threadSummary: threadSummary ?? null,
    workbenchMode: workbenchMode ?? undefined,
  });
  const shared = await buildSharedContextSnapshot({
    message,
    pendingAction,
    promptContext: baseContext,
  });
  const context = shared.promptContext;
  const workingMemory = shared.workingMemory;
  const tokenUsage = createTokenUsageSnapshot({
    contextTokens: baseTokenUsage.contextTokens + estimateTokenCount(context),
    inputTokens: baseTokenUsage.inputTokens,
  });
  emitUsage(tokenUsage);
  const memoryTitles = (context.memories ?? []).map((m) => m.title);
  const memoryNote = memoryTitles.length > 0 ? `\n命中记忆：${memoryTitles.join("、")}` : "";
  const threadSummaryNote = threadSummary ? `，线程摘要覆盖 ${threadSummary.messageCount} 条消息` : "";
  stream?.progress({
    detail: `mode=${context.mode ?? "general"}，命中 ${context.memories?.length ?? 0} 条记忆。`,
    message: "共享上下文已合成",
    stageId: streamStageId,
  });
  pushTrace({
    detail: `mode=${context.mode ?? "general"}，纳入 ${context.memories?.length ?? 0} 条长期记忆、${context.plans.length} 条计划、${context.checklists.length} 份清单、${context.contentItems?.length ?? 0} 条内容、${context.timelineEvents?.length ?? 0} 个时间线节点、${context.agentRuns?.length ?? 0} 条 AgentRun、${context.planReviews?.length ?? 0} 条 PlanReview${threadSummaryNote}。${memoryNote}`,
    id: "context-bootstrap",
    kind: "context",
    status: "done",
    title: "上下文已就绪",
  });

  const parts: string[] = [];
  if (context.plans.length > 0) parts.push(`${context.plans.length} 个计划`);
  if (context.checklists.length > 0) parts.push(`${context.checklists.length} 份清单`);
  if ((context.memories?.length ?? 0) > 0) parts.push(`${context.memories!.length} 条记忆`);
  if ((context.timelineEvents?.length ?? 0) > 0) parts.push(`${context.timelineEvents!.length} 个时间线`);

  if (parts.length > 0) {
    const summary = `• 已加载：${parts.join("、")}\n`;
    for (const token of splitIntoWordTokens(summary)) {
      emitToken(token, 'thinking');
    }
  }

  const contextSummary = (() => {
    const labels: string[] = [];
    if (workbenchMode === "today") {
      if (context.plans.length > 0) labels.push(`${context.plans.length} 项今日计划`);
      if (context.checklists.length > 0) labels.push(`${context.checklists.length} 份清单`);
      return `今日模式 · ${labels.length > 0 ? `已加载 ${labels.join("、")}` : "已就绪"}`;
    }
    if (workbenchMode === "writing") {
      if ((context.contentItems?.length ?? 0) > 0) labels.push(`${context.contentItems!.length} 条内容`);
      if ((context.memories?.length ?? 0) > 0) labels.push(`${context.memories!.length} 条写作记忆`);
      return `写作模式 · ${labels.length > 0 ? `已加载 ${labels.join("、")}` : "已就绪"}`;
    }
    if (workbenchMode === "plan" || workbenchMode === "execute") {
      if (context.plans.length > 0) labels.push(`${context.plans.length} 项计划`);
      if ((context.planReviews?.length ?? 0) > 0) labels.push(`${context.planReviews!.length} 条复盘`);
      return `计划模式 · ${labels.length > 0 ? `已加载 ${labels.join("、")}` : "已就绪"}`;
    }
    if (parts.length > 0) return `已加载：${parts.join("、")}`;
    return "上下文已就绪";
  })();

  return { context, contextSummary, tokenUsage, workingMemory };
};
