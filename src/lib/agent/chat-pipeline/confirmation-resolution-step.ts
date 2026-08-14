/**
 * Confirmation Resolution Step — Safety/Control Path.
 *
 * R6-C0-C-Fix: Extracted from resolve-intent-step.ts.
 *
 * This module ONLY handles pendingAction confirmation/cancel/ambiguous logic.
 * It is part of the AGENT_REQUIRE_LLM=1 protected baseline.
 *
 * Does NOT contain:
 *  - Business intent guessing
 *  - resolveRouterChain / resolveAgentIntent
 *  - Schedule intent boundary / regex slot extraction
 *  - Deterministic draft generation
 */

import { recordAgentConfirmationDecision, recordBatchConfirmationDecision } from "@/lib/agent/audit";
import { logAgentEvent } from "@/lib/agent/logger";
import {
  resolveAwaitConfirmationBranch,
  getBatchReceiptActionId,
  restoreConfirmedBatchIntents,
  restoreConfirmedIntent,
  type ConfirmationSignals,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type {
  AgentChatResponse,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type { AgentThread } from "@/payload-types";
import type { IntentResolution } from "./resolve-intent-step";

/* ──── Types ──── */

export type ConfirmationResolutionParams = {
  confirmationSignals: ConfirmationSignals;
  emitStatus: (status: string) => void;
  message: string;
  pendingAction: null | PendingAction;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    engine: import("@/lib/agent/schemas").AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  recordAgentConfirmationDecisionFn?: typeof recordAgentConfirmationDecision;
  recordBatchConfirmationDecisionFn?: typeof recordBatchConfirmationDecision;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { id: number };
};

export type ConfirmationResolutionResult =
  | {
      outcome: "early_exit";
      response: AgentChatResponse;
    }
  | {
      outcome: "continue";
      data: {
        batchExecuteIntents?: AgentIntent[];
        confirmedActionId: null | string;
        nextPendingAfterExecute?: null | PendingAction;
        resolution: IntentResolution;
        tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      };
    }
  | { outcome: "no_pending_action" };

/* ──── Main ──── */

export const resolveConfirmationStep = async (
  params: ConfirmationResolutionParams,
): Promise<ConfirmationResolutionResult> => {
  const {
    confirmationSignals,
    emitStatus,
    message,
    pendingAction,
    persistAgentTurn,
    pushTrace,
    recordAgentConfirmationDecisionFn = recordAgentConfirmationDecision,
    recordBatchConfirmationDecisionFn = recordBatchConfirmationDecision,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;

  /* ── Batch confirmation ── */
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
        intent: "clarify",
        nextPendingAction: null,
      });
      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 1,
          engine: "workflow",
          intent: "clarify",
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
        confirmedActionId: getBatchReceiptActionId(pendingAction),
        nextPendingAfterExecute: pendingAction.resumeQueue ?? null,
        resolution: { engine: "workflow", intent: primary },
        tokenUsage,
      },
    };
  }

  /* ── Single confirmation ── */
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
        intent: "clarify",
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
          intent: "clarify",
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

  return { outcome: "no_pending_action" };
};
