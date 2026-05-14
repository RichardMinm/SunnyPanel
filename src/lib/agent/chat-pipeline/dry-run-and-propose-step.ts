import type { Payload } from "payload";

import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import type { IntentResolution } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import { logAgentEvent } from "@/lib/agent/logger";
import { buildProposedActionMessage, dryRunAgentIntent } from "@/lib/agent/safety";
import type { AgentChatResponse, AgentEngine, AgentIntent, AgentTraceStep, PendingAction } from "@/lib/agent/schemas";
import { estimateTokenCount } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";
import { detectScheduleConflicts } from "@/lib/schedule/items";

import { findChecklistTimelineEvent, resolveChecklistGroupForAppend, resolveChecklistItem } from "../tools";

export type DryRunAndProposeStepParams = {
  confirmedActionId: null | string;
  context: BuildContextStepResult["context"];
  emitStatus: (status: string) => void;
  payload: Payload;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  resolution: IntentResolution;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { id: number };
};

export type DryRunAndProposeStepNext = {
  isDirectAnswer: boolean;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
};

export type DryRunAndProposeStepResult =
  | { outcome: "early_exit"; response: AgentChatResponse }
  | { outcome: "execute"; data: DryRunAndProposeStepNext };

export const runDryRunAndProposeStep = async (params: DryRunAndProposeStepParams): Promise<DryRunAndProposeStepResult> => {
  const {
    confirmedActionId,
    context,
    emitStatus,
    payload,
    persistAgentTurn,
    pushTrace,
    resolution,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  let tokenUsage = tokenUsageIn;
  const isDirectAnswer = resolution.intent.intent === "answer_question";
  const dryRunResult = confirmedActionId
    ? {
        type: "bypass" as const,
      }
    : await dryRunAgentIntent(resolution.intent, {
        detectScheduleConflicts: (args) =>
          detectScheduleConflicts(args.date, args.startTime, args.endTime, args.excludeId, payload),
        findTimelineEvent: findChecklistTimelineEvent,
        now: context.now,
        planCandidates: context.plans,
        resolveChecklistGroupForAppend,
        resolveChecklistItem,
      });

  if (dryRunResult.type === "clarify") {
    emitStatus("Dry-run 发现信息不完整，需要补充...");
    const assistantMessage = dryRunResult.assistantMessage;
    const outputTokens = estimateTokenCount(assistantMessage);
    tokenUsage = {
      ...tokenUsage,
      outputTokens,
      totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
    };
    pushTrace({
      detail: assistantMessage,
      id: "action-dry-run",
      kind: "analysis",
      status: "done",
      title: "Dry-run 未能唯一定位目标",
    });
    const updatedThread = await persistAgentTurn({
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: "clarify",
      nextPendingAction: dryRunResult.pendingAction,
    });

    logAgentEvent("info", "chat.dry_run_clarify", {
      intent: resolution.intent.intent,
      pendingAction: dryRunResult.pendingAction?.type ?? null,
      threadId: updatedThread.id,
      userId: user.id,
    });

    return {
      outcome: "early_exit",
      response: {
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: "clarify",
        pendingAction: dryRunResult.pendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      },
    };
  }

  const proposedAction = dryRunResult.type === "proposed_action" ? dryRunResult.action : null;

  if (proposedAction) {
    emitStatus("正在执行 dry-run 预检，等待用户确认...");
    const assistantMessage = buildProposedActionMessage(proposedAction);
    const nextPendingAction: PendingAction = {
      action: proposedAction,
      type: "await_confirmation",
    };
    const outputTokens = estimateTokenCount(assistantMessage);
    tokenUsage = {
      ...tokenUsage,
      outputTokens,
      totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
    };
    pushTrace({
      detail: `${proposedAction.summary} · risk=${proposedAction.riskLevel}`,
      id: "action-dry-run",
      kind: "action",
      status: "done",
      title: "Dry-run 已生成待确认动作",
    });
    const updatedThread = await persistAgentTurn({
      assistantMessage,
      confidence: resolution.intent.confidence,
      engine: resolution.engine,
      intent: resolution.intent.intent,
      nextPendingAction,
    });

    logAgentEvent("info", "chat.confirmation_requested", {
      actionId: proposedAction.id,
      intent: proposedAction.intent,
      riskLevel: proposedAction.riskLevel,
      threadId: updatedThread.id,
      userId: user.id,
    });

    return {
      outcome: "early_exit",
      response: {
        assistantMessage,
        confidence: resolution.intent.confidence,
        engine: resolution.engine,
        intent: resolution.intent.intent,
        pendingAction: nextPendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      },
    };
  }

  return {
    outcome: "execute",
    data: {
      isDirectAnswer,
      tokenUsage,
    },
  };
};
