import type { Payload } from "payload";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import {
  buildExecutionDecisionTraceStep,
  buildObservationTraceStep,
  buildResumedOrchestratorPlan,
  buildStrategyResumeOrchestratorPlan,
} from "@/lib/agent/execution-graph";
import { runOrchestrationSubgraph } from "@/lib/agent/langgraph/orchestration-subgraph";
import { orchestratorPlanToIntent } from "@/lib/agent/orchestrator";
import type { runOrchestrator } from "@/lib/agent/orchestration/orchestrator";
import { dispatchOrchestrator } from "@/lib/agent/orchestration/orchestrator-dispatcher";
import { composeFixedTaskPlan } from "@/lib/agent/orchestration/fixed-task-plan-composer";
import {
  validateHybridOrchestrationCandidate,
  type HybridCandidateValidationErrorCode,
} from "@/lib/agent/orchestration/hybrid-candidate-validator";
import { mapStructuredOutputToPlan } from "@/lib/agent/orchestration/orchestrator-mapper";
import {
  buildActorAuthorizedResourceSnapshot,
  isHybridQueryBoundaryEnabled,
  resolveHybridQueryBoundary,
} from "@/lib/agent/orchestration/query-boundary-resolver";
import { replanAfterTaskFailure, type ReplanInput, type ReplanResult } from "@/lib/agent/orchestration/replan";
import { runResidualPlanner } from "@/lib/agent/orchestration/residual-langchain-planner";
import type {
  InjectedResidualInvoke,
  ResidualPlannerFailureCode,
} from "@/lib/agent/orchestration/residual-langchain-planner";
import { resolveOrchestratorRuntimeMode } from "@/lib/agent/orchestration/runtime-config";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";
import type { OrchestratorPlan } from "@/lib/agent/orchestration/types";
import { projectCompletedOrchestrationToPlan } from "@/lib/agent/orchestration/projection";
import { logAgentEvent } from "@/lib/agent/logger";
import {
  isCancellationReply,
  isConfirmationReply,
  resolveOrchestrationPreflightIntent,
} from "@/lib/agent/intent-resolution";
import type {
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
  ProposedAgentAction,
} from "@/lib/agent/schemas";
import type {
  AgentIntentExecutionResult,
} from "@/lib/agent/executor";
import type { AutoApprovalContext } from "@/lib/agent/safety";
import type { AgentToolDryRunContext } from "@/lib/agent/tool-registry";
import type { StreamTokenCallback } from "@/lib/agent/client";
import type { ModelConfig } from "@/lib/agent/llm/model-config";
import { isAgentLLMDisabled } from "@/lib/agent/llm-required";
import { resolveRouterCanaryRouting } from "@/lib/agent/router/router-canary";
import { estimateTokenCount, splitIntoWordTokens } from "@/lib/agent/token-usage";
import type { AgentThread } from "@/payload-types";
import { detectScheduleConflicts, getScheduleItemById } from "@/lib/schedule/items";
import type { AgentStreamController } from "@/lib/agent/stream-events";

import {
  findChecklistTimelineEvent,
  resolveChecklistGroupForAppend,
  resolveChecklistItem,
} from "../checklist-resolvers";
import { resolveDeleteRecordTarget } from "../tools/delete-record";

const ORCHESTRATION_MAX_TASKS_PER_RUN = 10;

export type HybridOrchestrationStepObservation =
  | Readonly<{
      boundaryResolutionKind:
        | "clarify"
        | "compound"
        | "not_applicable"
        | "pure_query";
      fixedQueryIntent: AgentIntent["intent"] | null;
      fixedTaskOwnership: "deterministic_query_boundary" | null;
      provenanceSource:
        | "explicit_plan_id"
        | "none"
        | "resolved_exact_title"
        | "user_unspecified";
      queryScope: "aggregate" | "none" | "specific";
      type: "boundary";
    }>
  | Readonly<{
      code: HybridCandidateValidationErrorCode | null;
      result: "rejected" | "valid";
      type: "candidate_validation";
    }>
  | Readonly<{
      code: ResidualPlannerFailureCode | null;
      status: "success" | "unavailable";
      type: "residual_planning";
    }>
  | Readonly<{
      reached: true;
      type: "mapper";
    }>;

const collectRouterCanaryResources = (
  context: BuildContextStepResult["context"],
): {
  ids: number[];
  references: Array<{
    id: number;
    type: "checklist" | "memory" | "plan" | "schedule" | "timeline" | "writing";
  }>;
} => {
  const references: Array<{
    id: number;
    type: "checklist" | "memory" | "plan" | "schedule" | "timeline" | "writing";
  }> = [];
  const add = (
    type: typeof references[number]["type"],
    resources: readonly { id?: null | number }[],
  ) => {
    for (const resource of resources) {
      if (typeof resource.id === "number") references.push({ id: resource.id, type });
    }
  };

  add("plan", context.plans);
  add("checklist", context.checklists);
  add("memory", context.memories ?? []);
  add("writing", context.contentItems ?? []);
  add("writing", context.timelineCandidates ?? []);
  add("schedule", context.schedules ?? []);
  add("timeline", context.timelineEvents ?? []);

  return {
    ids: Array.from(new Set(references.map((reference) => reference.id))),
    references,
  };
};

export type OrchestrationStepParams = {
  autoApproval?: AutoApprovalContext;
  context: BuildContextStepResult["context"];
  compoundCheckpointer?: BaseCheckpointSaver;
  compoundRunnableConfig?: RunnableConfig;
  deferCompoundExecution?: boolean;
  dryRunContextOverrides?: Partial<AgentToolDryRunContext>;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  executeAction?: (
    intent: AgentIntent,
    action: ProposedAgentAction,
  ) => Promise<AgentIntentExecutionResult>;
  executeRollback?: (args: {
    actionId: string;
    intent: AgentIntent["intent"];
    rollbackPayload: unknown;
  }) => Promise<unknown>;
  forcedPlan?: OrchestratorPlan;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  onHybridObservation?: (
    observation: HybridOrchestrationStepObservation,
  ) => void;
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
  replanTaskFailure?: (input: ReplanInput) => Promise<ReplanResult>;
  mapStructuredOutputToPlanFn?: typeof mapStructuredOutputToPlan;
  conversationState?: import("@/lib/agent/conversation/types").AgentConversationState | null;
  resolvedHistory?: import("@/lib/agent/schemas").AgentChatMessage[];
  resolveRouterCanaryRoutingFn?: typeof resolveRouterCanaryRouting;
  runOrchestratorFn?: typeof runOrchestrator;
  residualPlannerInvoke?: InjectedResidualInvoke;
  residualPlannerModelConfig?: ModelConfig;
  runResidualPlannerFn?: typeof runResidualPlanner;
  stream?: AgentStreamController;
  terminalizeCompoundExecution?: boolean;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { collection?: "users"; id: number };
  validateHybridCandidateFn?: typeof validateHybridOrchestrationCandidate;
};

export type OrchestrationStepResult =
  | { outcome: "early_exit"; response: AgentChatResponse }
  | {
      outcome: "compound";
      data: {
        plan: OrchestratorPlan;
        tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      };
    }
  | {
      outcome: "continue";
      data: {
        orchestratorPlanSource?: "heuristic" | "llm" | null;
        preResolvedIntent: AgentIntent | null;
        tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
      };
    };

export const buildOrchestrationDryRunContext = ({
  context,
  overrides,
  payload,
}: {
  context: BuildContextStepResult["context"];
  overrides?: Partial<AgentToolDryRunContext>;
  payload: Payload;
}): AgentToolDryRunContext => ({
  detectScheduleConflicts: (args: {
    date: string;
    endTime?: null | string;
    excludeId?: number;
    startTime?: null | string;
  }) =>
    detectScheduleConflicts(
      args.date,
      args.startTime,
      args.endTime,
      args.excludeId,
      payload,
    ),
  findTimelineEvent: findChecklistTimelineEvent,
  now: context.now,
  planCandidates: context.plans,
  resolveChecklistGroupForAppend,
  resolveChecklistItem,
  resolveDeleteRecord: (args) => resolveDeleteRecordTarget(args, { payload }),
  resolveScheduleItem: (itemId: number) =>
    getScheduleItemById(itemId, payload),
  ...overrides,
});

export const runOrchestrationStep = async (params: OrchestrationStepParams): Promise<OrchestrationStepResult> => {
  const {
    autoApproval,
    context,
    compoundCheckpointer,
    compoundRunnableConfig,
    deferCompoundExecution = false,
    dryRunContextOverrides,
    emitStatus,
    emitToken,
    executeAction,
    executeRollback,
    forcedPlan,
    message,
    mapStructuredOutputToPlanFn = mapStructuredOutputToPlan,
    modelCallRecorder,
    onHybridObservation,
    payload,
    pendingAction,
    persistAgentTurn,
    pushTrace,
    replanTaskFailure,
    conversationState = null,
    resolvedHistory = [],
    resolveRouterCanaryRoutingFn = resolveRouterCanaryRouting,
    residualPlannerInvoke,
    residualPlannerModelConfig,
    runOrchestratorFn = dispatchOrchestrator,
    runResidualPlannerFn = runResidualPlanner,
    stream,
    terminalizeCompoundExecution = false,
    tokenUsage: tokenUsageIn,
    trace,
    user,
    validateHybridCandidateFn = validateHybridOrchestrationCandidate,
  } = params;
  let tokenUsage = tokenUsageIn;
  let hybridPlan: OrchestratorPlan | null = null;
  const recordHybridObservation = (
    observation: HybridOrchestrationStepObservation,
  ) => {
    try {
      onHybridObservation?.(observation);
    } catch {
      // Evaluation observation must never alter production behavior.
    }
  };
  const graphDryRunContext = buildOrchestrationDryRunContext({
    context,
    overrides: dryRunContextOverrides,
    payload,
  });
  const applyRouterCanary = async (primary: AgentIntent): Promise<AgentIntent> => {
    const resources = collectRouterCanaryResources(context);
    try {
      const canaryDecision = await resolveRouterCanaryRoutingFn({
        actor: "admin",
        context: {
          hasActivePlans: (context.plans ?? []).some((plan) => plan.state === "active"),
          hasChecklists: (context.checklists ?? []).length > 0,
          hasMemories: (context.memories ?? []).length > 0,
          now: context.now,
          resourceIds: resources.ids,
          resourceReferences: resources.references,
        },
        message,
        primary,
      });
      return canaryDecision.decision;
    } catch {
      return primary;
    }
  };
  const pushGraphTraceSteps = (graphResult: Awaited<ReturnType<typeof runOrchestrationSubgraph>>) => {
    const observationTraceStep = buildObservationTraceStep(graphResult.observations);

    if (observationTraceStep) {
      pushTrace(observationTraceStep);
    }

    pushTrace(buildExecutionDecisionTraceStep(graphResult));
  };
  const projectCompletedPlan = async (
    planToProject: OrchestratorPlan,
    orchestrationId: string,
    graphResult: Awaited<
      ReturnType<typeof runOrchestrationSubgraph>
    >,
  ) => {
    try {
      await projectCompletedOrchestrationToPlan({
        orchestrationId,
        payload,
        plan: planToProject,
        result: graphResult,
      });
    } catch (error) {
      pushTrace({
        detail:
          error instanceof Error
            ? error.message
            : String(error),
        id: `orchestration-projection-${orchestrationId}`,
        kind: "error",
        status: "error",
        title: "编排业务投影未完成",
      });
    }
  };

  const emitAndPersistEarlyExit = async ({
    assistantMessage,
    confidence = 0.9,
    engine = "workflow",
    intent,
    nextPendingAction,
  }: {
    assistantMessage: string;
    confidence?: number;
    engine?: AgentEngine;
    intent: AgentIntent["intent"];
    nextPendingAction: null | PendingAction;
  }): Promise<OrchestrationStepResult> => {
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
      confidence,
      engine,
      intent,
      nextPendingAction,
    });

    return {
      outcome: "early_exit",
      response: {
        assistantMessage,
        confidence,
        engine,
        intent,
        pendingAction: nextPendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
      },
    };
  };

  // Skip orchestration only for confirm/cancel/completion-note flows — those
  // are handled by their respective resolution branches. When the user responds
  // to a clarification (await_clarification), the orchestrator must re-evaluate
  // the combined request so compound plans (plan + schedule items) get decomposed.
  if (
    pendingAction?.type === "await_confirmation" ||
    pendingAction?.type === "await_batch_confirmation" ||
    pendingAction?.type === "await_completion_note"
  ) {
    stream?.progress({
      detail: `pending=${pendingAction.type}，交由确认/补充链路处理。`,
      message: "无需重新编排",
      stageId: "stage-orchestration",
    });
    return {
      outcome: "continue",
      data: {
        orchestratorPlanSource: null,
        preResolvedIntent: null,
        tokenUsage: tokenUsageIn,
      },
    };
  }

  if (pendingAction?.type === "await_strategy_resume") {
    if (isCancellationReply(message)) {
      pushTrace({
        detail: `已放弃策略重试：${pendingAction.reason}`,
        id: "orchestrator-strategy-resume",
        kind: "complete",
        status: "done",
        title: "已取消策略重试",
      });

      return emitAndPersistEarlyExit({
        assistantMessage: "已取消这次策略重试。我不会继续沿着刚才失败的路径执行。",
        confidence: 1,
        intent: "answer_question",
        nextPendingAction: null,
      });
    }

    if (!isConfirmationReply(message)) {
      pushTrace({
        detail: pendingAction.reason,
        id: "orchestrator-strategy-resume",
        kind: "analysis",
        status: "done",
        title: "仍在等待继续重试指令",
      });

      return emitAndPersistEarlyExit({
        assistantMessage: "这一步仍在策略暂停中。回复「继续」会换一种重规划策略重试，回复「取消」会放弃这次重试。",
        confidence: 1,
        intent: "answer_question",
        nextPendingAction: pendingAction,
      });
    }

    emitStatus("正在换一种策略重试...");
    pushTrace({
      detail: [
        `原策略：${pendingAction.strategyMode}`,
        `最近失败 Run：${pendingAction.recentRunIds.join("、") || "无"}`,
        `失败原因：${pendingAction.failureReason}`,
      ].join("\n"),
      id: "orchestrator-strategy-resume",
      kind: "analysis",
      status: "running",
      title: "正在换策略重试",
    });

    const resumedPlan = buildStrategyResumeOrchestratorPlan(pendingAction);

    if (resumedPlan.tasks.length === 0) {
      pushTrace({
        detail: "保存的策略暂停上下文中没有可恢复的子任务。",
        id: "orchestrator-strategy-resume",
        kind: "complete",
        status: "done",
        title: "策略重试已停止",
      });

      return emitAndPersistEarlyExit({
        assistantMessage: "这次策略暂停已经没有可继续执行的子任务。",
        confidence: 1,
        intent: "answer_question",
        nextPendingAction: null,
      });
    }

    const resumeReplanTaskFailure =
      replanTaskFailure ??
      ((input: ReplanInput) =>
        replanAfterTaskFailure({
          ...input,
          strategyNote: "用户已明确要求继续。避免重复同一个失败工具调用，优先改为前置核对、澄清目标或生成替代步骤。",
          strategyOverride: "incremental",
        }));

    if (deferCompoundExecution) {
      return {
        outcome: "compound",
        data: {
          plan: resumedPlan,
          tokenUsage,
        },
      };
    }

    const graphResult = await runOrchestrationSubgraph(resumedPlan, graphDryRunContext, {
      autoApproval,
      checkpointer: compoundCheckpointer,
      disableToolFailureRepair: true,
      disabledLoopDirectiveModes: ["avoid_recent_failure"],
      executeAction,
      executeRollback,
      maxTasksPerRun: ORCHESTRATION_MAX_TASKS_PER_RUN,
      message: pendingAction.originalMessage,
      modelCallRecorder,
      orchestrationId: pendingAction.orchestrationId ?? `orch-strategy-resume-${Date.now()}-${user.id}`,
      promptContext: context,
      runnableConfig: compoundRunnableConfig,
      replanTaskFailure: resumeReplanTaskFailure,
    });
    pushGraphTraceSteps(graphResult);
    await projectCompletedPlan(
      resumedPlan,
      pendingAction.orchestrationId ??
        `orch-strategy-resume-${user.id}`,
      graphResult,
    );

    pushTrace({
      detail: graphResult.evaluation.summary,
      id: "orchestrator-strategy-resume",
      kind: "complete",
      status: "done",
      title: "策略重试已完成",
    });

    logAgentEvent("info", "chat.orchestration_strategy_resumed", {
      failedTaskId: pendingAction.failedTaskId,
      nextPendingAction: graphResult.pendingAction?.type ?? null,
      strategyMode: pendingAction.strategyMode,
      threadId: undefined,
      userId: user.id,
    });

    return emitAndPersistEarlyExit({
      assistantMessage: graphResult.assistantMessage,
      confidence: 0.9,
      intent: graphResult.proposals[0]?.intent ?? graphResult.observations[0]?.intent ?? resumedPlan.tasks[0]?.intent ?? "answer_question",
      nextPendingAction: graphResult.pendingAction,
    });
  }

  if (pendingAction?.type === "await_queue_resume") {
    if (isCancellationReply(message)) {
      pushTrace({
        detail: `${pendingAction.deferredTaskIds.length} 个延后子任务已放弃。`,
        id: "orchestrator-resume",
        kind: "complete",
        status: "done",
        title: "已取消延后队列",
      });

      return emitAndPersistEarlyExit({
        assistantMessage: `已取消继续执行延后队列（${pendingAction.deferredTaskIds.length} 个子任务）。这次不会继续写入或执行后续动作。`,
        confidence: 1,
        intent: "answer_question",
        nextPendingAction: null,
      });
    }

    if (!isConfirmationReply(message)) {
      pushTrace({
        detail: `${pendingAction.deferredTaskIds.length} 个延后子任务等待恢复。`,
        id: "orchestrator-resume",
        kind: "analysis",
        status: "done",
        title: "仍在等待继续指令",
      });

      return emitAndPersistEarlyExit({
        assistantMessage: `还有 ${pendingAction.deferredTaskIds.length} 个延后子任务等待继续。回复「继续」从保存的队列恢复执行，或回复「取消」放弃这条待执行队列。`,
        confidence: 1,
        intent: "answer_question",
        nextPendingAction: pendingAction,
      });
    }

    emitStatus("正在恢复延后队列...");
    pushTrace({
      detail: `${pendingAction.deferredTaskIds.length} 个延后子任务将从保存的编排计划恢复，不重新解释“继续”。`,
      id: "orchestrator-resume",
      kind: "analysis",
      status: "running",
      title: "正在恢复延后队列",
    });

    const resumedPlan = buildResumedOrchestratorPlan(pendingAction);

    if (resumedPlan.tasks.length === 0) {
      pushTrace({
        detail: "保存的延后队列中没有可恢复的任务。",
        id: "orchestrator-resume",
        kind: "complete",
        status: "done",
        title: "延后队列已清空",
      });

      return emitAndPersistEarlyExit({
        assistantMessage: "这条延后队列已经没有可继续执行的子任务。",
        confidence: 1,
        intent: "answer_question",
        nextPendingAction: null,
      });
    }

    pushTrace({
      detail: `恢复 ${resumedPlan.tasks.length} 个子任务：${resumedPlan.tasks.map((task) => task.label).join(" → ")}`,
      id: "orchestrator-resume",
      kind: "analysis",
      status: "done",
      title: "延后队列已恢复",
    });

    if (deferCompoundExecution) {
      return {
        outcome: "compound",
        data: {
          plan: resumedPlan,
          tokenUsage,
        },
      };
    }

    const graphResult = await runOrchestrationSubgraph(resumedPlan, graphDryRunContext, {
      autoApproval,
      checkpointer: compoundCheckpointer,
      executeAction,
      executeRollback,
      maxTasksPerRun: ORCHESTRATION_MAX_TASKS_PER_RUN,
      message: pendingAction.originalMessage,
      modelCallRecorder,
      orchestrationId: pendingAction.orchestrationId ?? `orch-resume-${Date.now()}-${user.id}`,
      promptContext: context,
      runnableConfig: compoundRunnableConfig,
    });
    pushGraphTraceSteps(graphResult);
    await projectCompletedPlan(
      resumedPlan,
      pendingAction.orchestrationId ??
        `orch-resume-${user.id}`,
      graphResult,
    );

    logAgentEvent("info", "chat.orchestration_queue_resumed", {
      deferredTaskCount: pendingAction.deferredTaskIds.length,
      nextPendingAction: graphResult.pendingAction?.type ?? null,
      threadId: undefined,
      userId: user.id,
    });

    return emitAndPersistEarlyExit({
      assistantMessage: graphResult.assistantMessage,
      confidence: 0.9,
      intent: graphResult.proposals[0]?.intent ?? resumedPlan.tasks[0]?.intent ?? "answer_question",
      nextPendingAction: graphResult.pendingAction,
    });
  }

  const preflightIntent = resolveOrchestrationPreflightIntent({
    context,
    conversationState,
    history: resolvedHistory,
    message,
    pendingAction,
  });

  if (preflightIntent) {
    stream?.progress({
      detail: `preResolved=${preflightIntent.intent}`,
      message: "咨询保护命中",
      stageId: "stage-orchestration",
    });
    pushTrace({
      detail: "这轮输入先命中咨询/学习 follow-up 保护，不交给行动编排器执行写入型任务。",
      id: "orchestrator-readonly-preflight",
      kind: "analysis",
      status: "done",
      title: "已确认这轮先按咨询处理",
    });

    const canaryIntent = await applyRouterCanary(preflightIntent);
    return {
      outcome: "continue",
      data: {
        orchestratorPlanSource: "llm",
        preResolvedIntent: canaryIntent,
        tokenUsage,
      },
    };
  }

  if (
    runOrchestratorFn === dispatchOrchestrator
    && !forcedPlan
    && !pendingAction
    && isHybridQueryBoundaryEnabled(resolveOrchestratorRuntimeMode())
  ) {
    const snapshotResult = buildActorAuthorizedResourceSnapshot({
      authenticatedActor: { collection: "users", id: user.id },
      context,
    });

    if (snapshotResult.valid) {
      const boundary = resolveHybridQueryBoundary({
        authorizedSnapshot: snapshotResult.snapshot,
        originalRequest: message,
      });
      recordHybridObservation({
        boundaryResolutionKind: boundary.kind,
        fixedQueryIntent:
          boundary.kind === "pure_query" || boundary.kind === "compound"
            ? boundary.fixedQueryTask.intent
            : null,
        fixedTaskOwnership:
          boundary.kind === "pure_query" || boundary.kind === "compound"
            ? boundary.fixedMetadata.ownership
            : null,
        provenanceSource:
          boundary.kind === "pure_query" || boundary.kind === "compound"
            ? boundary.fixedMetadata.queryScopeProvenance.source
            : "none",
        queryScope:
          boundary.kind === "pure_query" || boundary.kind === "compound"
            ? boundary.fixedMetadata.queryScopeProvenance.scope === "plan"
              ? "specific"
              : "aggregate"
            : "none",
        type: "boundary",
      });

      if (boundary.kind === "pure_query") {
        pushTrace({
          detail: `preResolved=${boundary.preResolvedIntent.intent}`,
          id: "hybrid-query-boundary",
          kind: "analysis",
          status: "done",
          title: "已确定查询范围",
        });
        return {
          outcome: "continue",
          data: {
            orchestratorPlanSource: "llm",
            preResolvedIntent: boundary.preResolvedIntent,
            tokenUsage,
          },
        };
      }

      if (boundary.kind === "clarify") {
        const question = String(boundary.output.tasks[0]?.args.question ?? "").trim();
        pushTrace({
          detail: `reason=${boundary.reason}`,
          id: "hybrid-query-boundary",
          kind: "analysis",
          status: "done",
          title: "需要确认查询范围",
        });
        return {
          outcome: "continue",
          data: {
            orchestratorPlanSource: "llm",
            preResolvedIntent: {
              args: { question },
              confidence: 1,
              intent: "clarify",
            },
            tokenUsage,
          },
        };
      }

      if (boundary.kind === "compound") {
        const residual = await runResidualPlannerFn({
          input: boundary.residualInput,
          invoke: residualPlannerInvoke,
          modelCallRecorder,
          modelConfig: residualPlannerModelConfig,
          scopeId: "hybrid-query-boundary",
        });
        recordHybridObservation({
          code: residual.status === "success" ? null : residual.code,
          status: residual.status,
          type: "residual_planning",
        });
        if (residual.status !== "success") {
          pushTrace({
            detail: `code=${residual.code}`,
            id: "hybrid-query-boundary",
            kind: "analysis",
            status: "error",
            title: "后续任务暂时无法可靠规划",
          });
          return {
            outcome: "continue",
            data: {
              orchestratorPlanSource: "llm",
              preResolvedIntent: {
                args: {
                  question: "查询范围已经确定，但后续操作暂时无法可靠规划。请稍后重试或单独说明要创建的内容。",
                },
                confidence: 1,
                intent: "clarify",
              },
              tokenUsage,
            },
          };
        }

        const composed = composeFixedTaskPlan({
          fixedMetadata: boundary.fixedMetadata,
          fixedQueryTask: boundary.fixedQueryTask,
          residualTasks: residual.tasks,
        });
        if (composed.status !== "success") {
          pushTrace({
            detail: `code=${composed.code}`,
            id: "hybrid-query-boundary",
            kind: "analysis",
            status: "error",
            title: "复合任务合同校验失败",
          });
          return {
            outcome: "continue",
            data: {
              orchestratorPlanSource: "llm",
              preResolvedIntent: {
                args: {
                  question: "查询范围已经确定，但后续操作无法组成安全任务。请拆开说明下一步要做什么。",
                },
                confidence: 1,
                intent: "clarify",
              },
              tokenUsage,
            },
          };
        }

        const candidateValidation = validateHybridCandidateFn({
          allowedResourceIds: new Set(
            snapshotResult.snapshot.plans.map((plan) => plan.id),
          ),
          authorizedSnapshot: snapshotResult.snapshot,
          candidate: composed.candidate,
        });
        if (candidateValidation.status !== "valid") {
          recordHybridObservation({
            code: candidateValidation.code,
            result: "rejected",
            type: "candidate_validation",
          });
          pushTrace({
            detail: `code=${candidateValidation.code}`,
            id: "hybrid-query-boundary",
            kind: "analysis",
            status: "error",
            title: "复合候选验证失败",
          });
          return {
            outcome: "continue",
            data: {
              orchestratorPlanSource: "llm",
              preResolvedIntent: {
                args: {
                  question: "查询范围已经确定，但后续操作未通过安全校验。请拆开说明下一步要做什么。",
                },
                confidence: 1,
                intent: "clarify",
              },
              tokenUsage,
            },
          };
        }

        recordHybridObservation({
          code: null,
          result: "valid",
          type: "candidate_validation",
        });
        hybridPlan = mapStructuredOutputToPlanFn(candidateValidation.output);
        recordHybridObservation({
          reached: true,
          type: "mapper",
        });
        pushTrace({
          detail: `fixed=${boundary.fixedQueryTask.intent}; residual=${residual.tasks.length}`,
          id: "hybrid-query-boundary",
          kind: "analysis",
          status: "done",
          title: "已组合确定性查询与后续任务",
        });
      }
    }
  }

  /* LLM unavailable (disabled or not configured) + no pending action → controlled clarify.
   * Only gate the DEFAULT LLM path — a custom runOrchestratorFn (e.g. test mock)
   * bypasses this check so tests can verify orchestration logic independently.
   * Pending confirmation flows (confirm/cancel) are deterministic and still proceed. */
  if (
    runOrchestratorFn === dispatchOrchestrator
    && !pendingAction
    && !hybridPlan
  ) {
    /* Check both: env-var disable + actual model config presence */
    let llmUnavailable = isAgentLLMDisabled();
    if (!llmUnavailable) {
      try {
        const { getAgentModelConfig } = await import("../client");
        const config = await getAgentModelConfig();
        llmUnavailable = !config;
      } catch {
        // Config check failed — assume unavailable to avoid crashing later
        llmUnavailable = true;
      }
    }

    if (llmUnavailable) {
      const clarifyMessage =
        "当前 AI 服务暂时不可用，无法完成这次回答。你的会话状态已保留，请稍后重试。";
      const outputTokens = estimateTokenCount(clarifyMessage);
      for (const t of splitIntoWordTokens(clarifyMessage)) {
        emitToken(t, "response");
      }
      stream?.complete("stage-orchestration", "LLM 不可用");
      return {
        outcome: "early_exit",
        response: {
          assistantMessage: clarifyMessage,
          confidence: 0,
          engine: "workflow",
          intent: "clarify",
          pendingAction: null,
          threadId: 0,
          tokenUsage: {
            ...tokenUsage,
            outputTokens,
            totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
          },
          trace: [
            {
              detail: isAgentLLMDisabled()
                ? "LLM disabled via AGENT_DISABLE_LLM=1"
                : "LLM model config not available (no API key / model configured)",
              id: "orchestration-llm-unavailable-guard",
              kind: "analysis",
              status: "error",
              title: "LLM 不可用（已受控拦截）",
            },
          ],
        },
      };
    }
  }

  emitStatus("编排器正在理解你的请求...");
  pushTrace({
    detail: "分析是否为复合意图，并拆解子任务 DAG。",
    id: "orchestrator-plan",
    kind: "analysis",
    status: "running",
    title: "编排器正在拆解任务",
  });

  const plan =
    forcedPlan ??
    hybridPlan ??
    (runOrchestratorFn === dispatchOrchestrator
      ? await dispatchOrchestrator(message, context, undefined, {
          modelCallRecorder,
          role: "orchestrator",
          scopeId: "turn-orchestrator",
        })
      : await (async () => {
          modelCallRecorder?.record("orchestrator", "turn-orchestrator");
          return runOrchestratorFn(message, context);
        })());
  stream?.progress({
    detail: `${plan.mode === "compound" ? "复合" : "单一"}意图 · ${plan.tasks.length} 个子任务`,
    message: "编排计划已生成",
    stageId: "stage-orchestration",
  });

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
    if (deferCompoundExecution) {
      return {
        outcome: "compound",
        data: {
          plan,
          tokenUsage,
        },
      };
    }

    const orchestrationId = `orch-${Date.now()}-${user.id}`;

    const graphResult = await runOrchestrationSubgraph(
      plan,
      graphDryRunContext,
      {
        autoApproval,
        checkpointer: compoundCheckpointer,
        executeAction,
        executeRollback,
        maxTasksPerRun: ORCHESTRATION_MAX_TASKS_PER_RUN,
        message,
        modelCallRecorder,
        orchestrationId,
        promptContext: context,
        runnableConfig: compoundRunnableConfig,
      },
    );
    pushGraphTraceSteps(graphResult);
    await projectCompletedPlan(
      plan,
      orchestrationId,
      graphResult,
    );
    for (const proposal of graphResult.proposals.slice(0, 4)) {
      stream?.change({
        collections: Array.from(new Set(proposal.changes.map((change) => change.collection))),
        riskLevel: proposal.riskLevel,
        stageId: "stage-orchestration",
        summary: proposal.summary,
      });
    }
    stream?.progress({
      detail: `${graphResult.executedCount} 项已执行，${graphResult.proposals.length} 项待确认。`,
      message: "编排执行图已评估",
      stageId: "stage-orchestration",
    });

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

    if (
      (terminalizeCompoundExecution ||
        graphResult.executedCount === 0) &&
      !graphResult.pendingAction
    ) {
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
        intent:
          graphResult.observations[0]?.intent ??
          "answer_question",
        nextPendingAction: null,
      });

      return {
        outcome: "early_exit",
        response: {
          assistantMessage,
          confidence: 0.9,
          engine: "workflow",
          intent:
            graphResult.observations[0]?.intent ??
            "answer_question",
          pendingAction: null,
          trace,
          threadId: updatedThread.id,
          tokenUsage,
        },
      };
    }
  }

  let preResolvedIntent = orchestratorPlanToIntent(plan);

  /* ── Router Canary / Shadow Hook ──
   * Primary is finalized first. The Canary coordinator may only return a
   * schema-valid read/clarify adoption; every failure preserves Primary.
   * When Canary is off, the coordinator retains the independent Shadow path. */
  try {
    if (preResolvedIntent) {
      preResolvedIntent = await applyRouterCanary(preResolvedIntent);
    } else {
      const { scheduleRouterShadow } = await import("../router/router-shadow");
      scheduleRouterShadow({
        actor: "admin",
        primaryIntent: "unknown",
        message,
        hasActivePlans: (context.plans ?? []).some((p) => p.state === "active"),
        hasChecklists: (context.checklists ?? []).length > 0,
        hasMemories: (context.memories ?? []).length > 0,
        now: context.now,
      });
    }
  } catch {
    /* Canary/Shadow failure must not affect Primary */
  }

  return {
    outcome: "continue",
    data: {
      orchestratorPlanSource: plan.source ?? "llm",
      preResolvedIntent,
      tokenUsage,
    },
  };
};
