import type { Payload } from "payload";

import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import { buildObservationTraceStep, executeOrchestrationGraph } from "@/lib/agent/execution-graph";
import { orchestratorPlanToIntent, runOrchestrator } from "@/lib/agent/orchestrator";
import { logAgentEvent } from "@/lib/agent/logger";
import type {
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type { AutoApprovalContext } from "@/lib/agent/safety";
import type { StreamTokenCallback } from "@/lib/agent/client";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";
import { detectScheduleConflicts } from "@/lib/schedule/items";

import {
  findChecklistTimelineEvent,
  resolveChecklistGroupForAppend,
  resolveChecklistItem,
} from "../checklist-resolvers";

export type OrchestrationStepParams = {
  autoApproval?: AutoApprovalContext;
  context: BuildContextStepResult["context"];
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  message: string;
  payload: Payload;
  pendingAction: null | PendingAction;
  persistAgentTurn: (args: {
    assistantMessage: string;
    confidence?: number;
    engine: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }) => Promise<AgentThread>;
  pushTrace: (step: AgentTraceStep) => void;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { id: number };
};

export type OrchestrationStepResult =
  | { outcome: "early_exit"; response: AgentChatResponse }
  | {
      outcome: "continue";
      data: {
        preResolvedIntent: AgentIntent | null;
        tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      };
    };

export const runOrchestrationStep = async (params: OrchestrationStepParams): Promise<OrchestrationStepResult> => {
  const {
    autoApproval,
    context,
    emitStatus,
    emitToken,
    message,
    payload,
    pendingAction,
    persistAgentTurn,
    pushTrace,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  } = params;

  // Skip orchestration only for confirm/cancel/completion-note flows — those
  // are handled by their respective resolution branches. When the user responds
  // to a clarification (await_clarification), the orchestrator must re-evaluate
  // the combined request so compound plans (plan + schedule items) get decomposed.
  if (
    pendingAction?.type === "await_confirmation" ||
    pendingAction?.type === "await_batch_confirmation" ||
    pendingAction?.type === "await_completion_note"
  ) {
    return {
      outcome: "continue",
      data: { preResolvedIntent: null, tokenUsage: tokenUsageIn },
    };
  }

  emitStatus("编排器正在理解你的请求...");
  pushTrace({
    detail: "分析是否为复合意图，并拆解子任务 DAG。",
    id: "orchestrator-plan",
    kind: "analysis",
    status: "running",
    title: "编排器正在拆解任务",
  });

  const plan = await runOrchestrator(message, context, (token) => emitToken(token, 'thinking'));
  let tokenUsage = tokenUsageIn;

  pushTrace({
    detail: `${plan.mode === "compound" ? "复合" : "单一"}意图 · ${plan.tasks.length} 个子任务 · ${plan.reasoning}`,
    id: "orchestrator-plan",
    kind: "analysis",
    status: "done",
    title: `编排完成：${plan.tasks.map((task) => task.label).join(" → ")}`,
  });

  // Stream orchestrator analysis as tokens so the user sees progress during the wait
  if (plan.mode === "compound" && plan.tasks.length > 1) {
    const labelSummary = plan.tasks.map((t) => t.label).join(" → ");
    const orchestrationToken = `• 编排器拆解为 ${plan.tasks.length} 个子任务：${labelSummary}\n`;
    emitToken(orchestrationToken, 'thinking');
  } else if (plan.reasoning) {
    const orchestrationToken = `• 编排器分析：${plan.reasoning}\n`;
    emitToken(orchestrationToken, 'thinking');
  }

  if (plan.mode === "compound" && plan.tasks.length > 1) {
    const orchestrationId = `orch-${Date.now()}-${user.id}`;
    const relatedPlanId = plan.tasks
      .map((task) => {
        const args = task.args as { planId?: number; relatedPlanId?: number };

        return typeof args.relatedPlanId === "number"
          ? args.relatedPlanId
          : typeof args.planId === "number"
            ? args.planId
            : null;
      })
      .find((id): id is number => typeof id === "number");

    if (relatedPlanId) {
      await payload.update({
        collection: "plans",
        data: {
          agentContext: {
            mode: plan.mode,
            orchestrationId,
            reasoning: plan.reasoning,
            updatedAt: new Date().toISOString(),
          },
          subtasks: plan.tasks.map((task) => ({
            agentRole: task.agentRole,
            id: task.id,
            intent: task.intent,
            label: task.label,
            status: "pending",
          })),
        },
        depth: 0,
        id: relatedPlanId,
        overrideAccess: true,
      });
    }

    const graphResult = await executeOrchestrationGraph(
      plan,
      {
        detectScheduleConflicts: (args) =>
          detectScheduleConflicts(args.date, args.startTime, args.endTime, args.excludeId, payload),
        findTimelineEvent: findChecklistTimelineEvent,
        now: context.now,
        planCandidates: context.plans,
        resolveChecklistGroupForAppend,
        resolveChecklistItem,
      },
      {
        autoApproval,
        message,
        orchestrationId,
        promptContext: context,
      },
    );
    const observationTraceStep = buildObservationTraceStep(graphResult.observations);

    if (observationTraceStep) {
      pushTrace(observationTraceStep);
    }

    if (graphResult.pendingAction) {
      const assistantMessage = graphResult.assistantMessage;
      for (const token of splitIntoWordTokens(assistantMessage)) {
        emitToken(token, 'response');
        await new Promise((r) => setTimeout(r, 6));
      }
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      const primaryIntent = graphResult.proposals[0]?.intent ?? "clarify";
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 0.9,
        engine: "workflow",
        intent: primaryIntent,
        nextPendingAction: graphResult.pendingAction,
      });

      logAgentEvent("info", "chat.orchestration_batch_confirm", {
        proposalCount: graphResult.proposals.length,
        threadId: updatedThread.id,
        userId: user.id,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 0.9,
          engine: "workflow",
          intent: primaryIntent,
          pendingAction: graphResult.pendingAction,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }

    if (graphResult.executedCount === 0 && !graphResult.pendingAction) {
      const assistantMessage = graphResult.assistantMessage;
      for (const token of splitIntoWordTokens(assistantMessage)) {
        emitToken(token, 'response');
        await new Promise((r) => setTimeout(r, 6));
      }
      const outputTokens = estimateTokenCount(assistantMessage);
      tokenUsage = {
        ...tokenUsage,
        outputTokens,
        totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
      };
      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 0.9,
        engine: "workflow",
        intent: "answer_question",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 0.9,
          engine: "workflow",
          intent: "answer_question",
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }
  }

  const preResolvedIntent = orchestratorPlanToIntent(plan);

  return {
    outcome: "continue",
    data: {
      preResolvedIntent,
      tokenUsage,
    },
  };
};
