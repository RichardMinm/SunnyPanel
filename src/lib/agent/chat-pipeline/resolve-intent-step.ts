import { recordAgentConfirmationDecision, recordBatchConfirmationDecision } from "@/lib/agent/audit";
import {
  generateStreamingReply,
  type GenerateStreamingReplyArgs,
  type generateIntentWithAgentModel,
  type StreamTokenCallback,
} from "@/lib/agent/client";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import {
  resolveAwaitConfirmationBranch,
  restoreConfirmedBatchIntents,
  restoreConfirmedIntent,
  type ConfirmationSignals,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { buildIntentTraceSummary } from "@/lib/agent/chat-pipeline/intent-trace";
import { resolveAgentIntent } from "@/lib/agent/intent-resolution";
import { logAgentEvent } from "@/lib/agent/logger";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
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
  emitToken: StreamTokenCallback;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  generateStreamingReplyFn?: (args: GenerateStreamingReplyArgs) => Promise<{
    tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
    text: string;
  } | null>;
  intentModelEngine: AgentEngine;
  message: string;
  modelResolver: typeof generateIntentWithAgentModel;
  pendingAction: null | PendingAction;
  preResolvedIntent?: AgentIntent | null;
  recordAgentConfirmationDecisionFn?: typeof recordAgentConfirmationDecision;
  recordBatchConfirmationDecisionFn?: typeof recordBatchConfirmationDecision;
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
  batchExecuteIntents?: AgentIntent[];
  confirmedActionId: null | string;
  nextPendingAfterExecute?: null | PendingAction;
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
    emitToken,
    emitUsage,
    generateStreamingReplyFn = generateStreamingReply,
    intentModelEngine,
    message,
    modelResolver,
    pendingAction,
    preResolvedIntent,
    recordAgentConfirmationDecisionFn = recordAgentConfirmationDecision,
    recordBatchConfirmationDecisionFn = recordBatchConfirmationDecision,
    persistAgentTurn,
    pushTrace,
    resolvedHistory,
    thread,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;

  if (pendingAction?.type === "await_batch_confirmation") {
    if (confirmationSignals.cancel) {
      await recordBatchConfirmationDecisionFn({
        actions: pendingAction.actions,
        decision: "canceled",
        message,
        orchestrationId: pendingAction.orchestrationId,
        userId: user.id,
      });
      const assistantMessage = `已取消批量确认（共 ${pendingAction.actions.length} 项），未写入任何数据。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 1,
        engine: "workflow",
        intent: pendingAction.actions[0]?.intent ?? "clarify",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: pendingAction.actions[0]?.intent ?? "clarify",
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    if (!confirmationSignals.confirm) {
      const assistantMessage = `仍在等待批量确认（${pendingAction.actions.length} 项）。回复「确认」执行全部，或「取消」放弃。`;
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
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

    const batchIntents = restoreConfirmedBatchIntents(pendingAction);
    const primary = batchIntents[0];

    await recordBatchConfirmationDecisionFn({
      actions: pendingAction.actions,
      decision: "confirmed",
      message,
      orchestrationId: pendingAction.orchestrationId,
      userId: user.id,
    });

    pushTrace({
      detail: `批量确认 ${batchIntents.length} 项操作`,
      id: "confirmation-batch-received",
      kind: "action",
      status: "done",
      title: "已收到批量确认",
    });

    return {
      outcome: "continue",
      data: {
        batchExecuteIntents: batchIntents,
        confirmedActionId: pendingAction.orchestrationId ?? "batch",
        nextPendingAfterExecute: pendingAction.resumeQueue ?? null,
        resolution: {
          engine: "workflow",
          intent: primary,
        },
        tokenUsage,
      },
    };
  }

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
      await recordAgentConfirmationDecisionFn({
        action: pendingAction.action,
        decision: "canceled",
        message,
        userId: user.id,
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
    const nextPendingAfterExecute =
      pendingAction.deferredActions && pendingAction.deferredActions.length > 0
        ? {
            actions: pendingAction.deferredActions,
            orchestrationId: pendingAction.orchestrationId,
            resumeQueue: pendingAction.resumeQueue,
            type: "await_batch_confirmation" as const,
          }
        : (pendingAction.resumeQueue ?? null);
    emitStatus("正在执行已确认动作...");
    pushTrace({
      detail: `${pendingAction.action.summary} · risk=${pendingAction.action.riskLevel}`,
      id: "confirmation-received",
      kind: "action",
      status: "running",
      title: "已收到确认",
    });
    await recordAgentConfirmationDecisionFn({
      action: pendingAction.action,
      decision: "confirmed",
      message,
      userId: user.id,
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
        nextPendingAfterExecute,
        resolution,
        tokenUsage,
      },
    };
  }

  if (preResolvedIntent) {
    pushTrace({
      detail: `编排器已解析为 ${preResolvedIntent.intent}`,
      id: "analysis-intent",
      kind: "analysis",
      status: "done",
      title: `编排意图：${preResolvedIntent.intent}`,
    });

    const isConversational = preResolvedIntent.intent === "answer_question" || preResolvedIntent.intent === "clarify";
    if (isConversational) {
      const preResolvedText =
        (preResolvedIntent.intent === "answer_question"
          ? (preResolvedIntent.args as { answer?: string }).answer
          : undefined)
        ?? (preResolvedIntent.intent === "clarify"
          ? (preResolvedIntent.args as { question?: string }).question
          : undefined)
        ?? ('reply' in preResolvedIntent ? (preResolvedIntent as { reply?: string }).reply : undefined);
      emitStatus("正在生成回复...");
      const replyResult = await generateStreamingReplyFn({
        context,
        groundedAnswer: preResolvedText,
        history: resolvedHistory,
        message,
        onToken: (token) => emitToken(token, 'response'),
      });
      if (replyResult && replyResult.text.trim().length > 0) {
        preResolvedIntent.reply = replyResult.text;
        tokenUsage = {
          ...tokenUsage,
          outputTokens: replyResult.tokenUsage.outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + replyResult.tokenUsage.outputTokens,
          providerInputTokens: replyResult.tokenUsage.providerInputTokens,
          providerOutputTokens: replyResult.tokenUsage.providerOutputTokens,
          source: replyResult.tokenUsage.source,
        };
      } else {
        // Fallback: stream pre-resolved text word by word when LLM is unavailable
        if (typeof preResolvedText === "string" && preResolvedText.length > 0) {
          for (const token of splitIntoWordTokens(preResolvedText)) {
            emitToken(token, 'response');
            await new Promise((r) => setTimeout(r, 6));
          }
        }
      }
    }

    return {
      outcome: "continue",
      data: {
        confirmedActionId: null,
        resolution: {
          engine: "workflow",
          intent: preResolvedIntent,
        },
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

  // Stream conversational replies with true LLM token streaming
  const conversationalIntent = resolution.intent.intent === "answer_question" || resolution.intent.intent === "clarify";
  if (conversationalIntent) {
    const intent = resolution.intent;
    const preResolvedText =
      (intent.intent === "answer_question" ? intent.args.answer : null)
      ?? (intent.intent === "clarify" ? intent.args.question : null)
      ?? ('reply' in intent ? (intent as { reply?: string }).reply : undefined);

    emitStatus("正在生成回复...");
    const replyResult = await generateStreamingReplyFn({
      context,
      groundedAnswer: typeof preResolvedText === "string" ? preResolvedText : undefined,
      history: resolvedHistory,
      message,
      onToken: (token) => emitToken(token, 'response'),
    });

    if (replyResult && replyResult.text.trim().length > 0) {
      resolution.intent.reply = replyResult.text;
      tokenUsage = {
        ...tokenUsage,
        outputTokens: replyResult.tokenUsage.outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + replyResult.tokenUsage.outputTokens,
        providerInputTokens: replyResult.tokenUsage.providerInputTokens,
        providerOutputTokens: replyResult.tokenUsage.providerOutputTokens,
        source: replyResult.tokenUsage.source,
      };
    } else if (typeof preResolvedText === "string" && preResolvedText.length > 0) {
      // Fallback: progressive word-by-word streaming of pre-resolved text
      for (const token of splitIntoWordTokens(preResolvedText)) {
        emitToken(token, 'response');
        await new Promise((r) => setTimeout(r, 6));
      }
    }
  } else {
    // Emit intent analysis token so the user sees what was identified during the wait
    emitToken(`• 识别意图：${intentSummary.title.replace(/^识别为/, "")}\n`, 'thinking');
  }

  return {
    outcome: "continue",
    data: {
      confirmedActionId: null,
      resolution,
      tokenUsage,
    },
  };
};
