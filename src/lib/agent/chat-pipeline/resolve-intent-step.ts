import { recordAgentConfirmationDecision } from "@/lib/agent/audit";
import type { generateIntentWithAgentModel } from "@/lib/agent/client";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import {
  resolveAwaitConfirmationBranch,
  restoreConfirmedIntent,
  type ConfirmationSignals,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { buildIntentTraceSummary } from "@/lib/agent/chat-pipeline/intent-trace";
import { resolveAgentIntent } from "@/lib/agent/intent";
import { logAgentEvent } from "@/lib/agent/logger";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";

export type IntentResolution = {
  engine: AgentEngine;
  intent: AgentIntent;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

export type ResolveIntentStepParams = {
  confirmationSignals: ConfirmationSignals;
  context: BuildContextStepResult["context"];
  emitStatus: (status: string) => void;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  intentModelEngine: AgentEngine;
  message: string;
  modelResolver: typeof generateIntentWithAgentModel;
  pendingAction: null | PendingAction;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  resolvedHistory: AgentChatMessage[];
  thread: AgentThread;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { id: number };
};

export type ResolveIntentStepNext = {
  confirmedActionId: null | string;
  resolution: IntentResolution;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

export type ResolveIntentStepResult =
  | { outcome: "early_exit"; response: AgentChatResponse }
  | { outcome: "continue"; data: ResolveIntentStepNext };

export const runResolveIntentStep = async (params: ResolveIntentStepParams): Promise<ResolveIntentStepResult> => {
  const {
    confirmationSignals,
    context,
    emitStatus,
    emitUsage,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
    persistAgentTurn,
    pushTrace,
    resolvedHistory,
    thread,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;

  if (pendingAction?.type === "await_confirmation") {
    const branch = resolveAwaitConfirmationBranch(pendingAction, confirmationSignals);

    if (branch === "cancel") {
      emitStatus("正在取消待确认动作...");
      pushTrace({
        detail: `${pendingAction.action.summary} · risk=${pendingAction.action.riskLevel}`,
        id: "confirmation-cancel",
        kind: "action",
        status: "running",
        title: "正在取消待确认动作",
      });
      await recordAgentConfirmationDecision({
        action: pendingAction.action,
        decision: "canceled",
        message,
      });
      const assistantMessage = `已取消「${pendingAction.action.summary}」。这次没有写入计划、清单或 Timeline。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: "取消决定已经写入 AgentRun 审计记录。",
        id: "confirmation-cancel",
        kind: "complete",
        status: "done",
        title: "待确认动作已取消",
      });
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: pendingAction.action.intent,
        nextPendingAction: null,
      });
      logAgentEvent("info", "chat.confirmation_canceled", {
        actionId: pendingAction.action.id,
        intent: pendingAction.action.intent,
        threadId: updatedThread.id,
        userId: user.id,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: pendingAction.action.intent,
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    if (branch === "still_waiting") {
      const assistantMessage = `这一步还在等待确认：${pendingAction.action.summary}。\n\n回复「确认」或「执行」继续，回复「取消」放弃。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      pushTrace({
        detail: `待确认动作：${pendingAction.action.summary}`,
        id: "confirmation-wait",
        kind: "analysis",
        status: "done",
        title: "仍在等待明确确认",
      });
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: "clarify",
        nextPendingAction: pendingAction,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: "clarify",
          pendingAction,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    const confirmedIntent = restoreConfirmedIntent(pendingAction.action);
    const confirmedActionId = pendingAction.action.id;
    emitStatus("正在执行已确认动作...");
    pushTrace({
      detail: `${pendingAction.action.summary} · risk=${pendingAction.action.riskLevel}`,
      id: "confirmation-received",
      kind: "action",
      status: "running",
      title: "已收到确认",
    });
    await recordAgentConfirmationDecision({
      action: pendingAction.action,
      decision: "confirmed",
      message,
    });
    pushTrace({
      detail: "确认决定已经写入 AgentRun 审计记录。",
      id: "confirmation-received",
      kind: "action",
      status: "done",
      title: "确认已记录",
    });
    const resolution: IntentResolution = {
      engine: "workflow",
      intent: confirmedIntent,
    };
    pushTrace({
      detail: "使用待确认动作中保存的参数继续执行，不重新解释为新指令。",
      id: "analysis-intent",
      kind: "analysis",
      status: "done",
      title: `确认执行：${pendingAction.action.summary}`,
    });

    return {
      outcome: "continue",
      data: {
        confirmedActionId,
        resolution,
        tokenUsage,
      },
    };
  }

  emitStatus("正在分析用户意图...");
  pushTrace({
    detail: "会结合当前输入、最近对话和待处理动作来判断下一步。",
    id: "analysis-intent",
    kind: "analysis",
    status: "running",
    title: "正在判断你的真实意图",
  });
  const resolution = await resolveAgentIntent({
    context,
    history: resolvedHistory,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
  });
  if (resolution.tokenUsage) {
    tokenUsage = resolution.tokenUsage;
    emitUsage(tokenUsage);
  }
  const intentSummary = buildIntentTraceSummary(resolution.intent);
  emitStatus(`已识别意图：${intentSummary.title.replace(/^识别为/, "")}`);
  pushTrace({
    detail: intentSummary.detail,
    id: "analysis-intent",
    kind: "analysis",
    status: "done",
    title: intentSummary.title,
  });

  logAgentEvent("info", "chat.intent_resolved", {
    confidence: resolution.intent.confidence,
    engine: resolution.engine,
    intent: resolution.intent.intent,
    threadId: thread.id,
    userId: user.id,
  });

  return {
    outcome: "continue",
    data: {
      confirmedActionId: null,
      resolution,
      tokenUsage,
    },
  };
};
