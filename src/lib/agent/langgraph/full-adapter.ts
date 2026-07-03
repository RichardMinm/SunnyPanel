import { appendFileSync } from "node:fs";

import { getAgentDebugLogPath } from "@/lib/agent/debug-log";
import {
  Command,
  EmptyInputError,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";

import { parseDefinitionQuestionIntent } from "@/lib/agent/intent/heuristics/knowledge";
import {
  createPayloadActionReceiptStore,
  runIdempotentAgentAction,
  type AgentActionReceiptStore,
} from "@/lib/agent/action-receipts";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import type { runBuildContextStep } from "@/lib/agent/chat-pipeline/build-context-step";
import {
  resolveConfirmationSignals,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import type { runDryRunAndProposeStep } from "@/lib/agent/chat-pipeline/dry-run-and-propose-step";
import type { runExecuteAndPersistStep } from "@/lib/agent/chat-pipeline/execute-and-persist-step";
import {
  buildOrchestrationDryRunContext,
  type runOrchestrationStep,
} from "@/lib/agent/chat-pipeline/orchestration-step";
import type { runResolveIntentStep } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import type { RunAgentChatPipelineDeps } from "@/lib/agent/chat-pipeline/run-agent-chat-pipeline";
import type { StreamTokenCallback } from "@/lib/agent/client";
import {
  executeAgentIntent,
  type AgentIntentExecutor,
} from "@/lib/agent/executor";
import {
  buildSunnyAgentCheckpointConfig,
  getSunnyAgentPostgresSaver,
} from "@/lib/agent/langgraph/checkpointer";
import {
  compileFullSunnyAgentGraph,
  getInterruptedCompoundResult,
  getInterruptedAgentResponse,
  type FullSunnyAgentGraphDependencies,
} from "@/lib/agent/langgraph/full-runtime";
import {
  compileMountedOrchestrationSubgraph,
  type NativeOrchestrationSubgraphDependencies,
} from "@/lib/agent/langgraph/orchestration-subgraph";
import type { runAgentLearningLoop } from "@/lib/agent/learning-loop";
import { executeRollbackFromPayload } from "@/lib/agent/rollback";
import {
  buildExecutionDecisionTraceStep,
  buildObservationTraceStep,
} from "@/lib/agent/execution-graph";
import {
  evaluatePlanReadinessGate,
  extractPlanSlotsFromSessionState,
} from "@/lib/agent/planning/readiness-gate";
import { evaluateScheduleReadinessGate } from "@/lib/agent/schedule/readiness-gate";
import {
  applyPlanCreationPreparationToResolution,
  evaluatePlanCreationPreparation,
} from "@/lib/agent/planning/prepare-plan-creation";
import { evaluatePlanDraftRevision } from "@/lib/agent/planning/revise-plan-draft";
import { evaluateChecklistDraftGeneration } from "@/lib/agent/planning/checklist-draft-flow";
import {
  applyChecklistCreationPreparationToResolution,
  evaluateChecklistCreationPreparation,
} from "@/lib/agent/planning/prepare-checklist-creation";
import {
  applyScheduleCreationPreparationToResolution,
  evaluateScheduleCreationPreparation,
} from "@/lib/agent/schedule/prepare-schedule-creation";
import { evaluateScheduleDraftRevision } from "@/lib/agent/schedule/revise-draft-flow";
import { createNativeOrchestrationTaskExecutor } from "@/lib/agent/orchestration/native-task-executor";
import { summarizeExecutionQueue } from "@/lib/agent/orchestration/observations";
import {
  projectCompletedOrchestrationToPlan,
  projectConfirmedOrchestrationToPlan,
} from "@/lib/agent/orchestration/projection";
import { replanAfterTaskFailure } from "@/lib/agent/orchestration/replan";
import { buildToolFailureRepairPlan } from "@/lib/agent/orchestration/tool-failure-repair";
import type {
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import {
  createAgentStreamController,
  type AgentStreamChangeEvent,
  type AgentStreamProgressEvent,
  type AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import type { appendAgentThreadTurn } from "@/lib/agent/thread";
import { toPromptThreadSummary } from "@/lib/agent/thread-summary";
import type { AgentThread } from "@/payload-types";
import {
  estimateTokenCount,
  splitIntoWordTokens,
} from "@/lib/agent/token-usage";

export type FullLangGraphAdapterSteps = {
  appendAgentThreadTurn: typeof appendAgentThreadTurn;
  runAgentLearningLoop: typeof runAgentLearningLoop;
  runBuildContextStep: typeof runBuildContextStep;
  runDryRunAndProposeStep: typeof runDryRunAndProposeStep;
  runExecuteAndPersistStep: typeof runExecuteAndPersistStep;
  runOrchestrationStep: typeof runOrchestrationStep;
  runResolveIntentStep: typeof runResolveIntentStep;
};

type BufferedTurn = {
  assistantMessage: string;
  confidence?: number;
  conversationState?: unknown;
  engine: AgentEngine;
  intent: AgentIntent["intent"];
  nextPendingAction: null | PendingAction;
};

const mergeTrace = (
  left: AgentTraceStep[] | undefined,
  right: AgentTraceStep[],
) => {
  const merged = new Map<string, AgentTraceStep>();

  for (const step of [...(left ?? []), ...right]) {
    merged.set(step.id, {
      ...(merged.get(step.id) ?? {}),
      ...step,
    } as AgentTraceStep);
  }

  return [...merged.values()];
};

export const createRunFullLangGraphAgentChatPipeline = (
  deps: RunAgentChatPipelineDeps,
  steps: FullLangGraphAdapterSteps,
  options?: {
    checkpointer?: BaseCheckpointSaver;
    executeIntent?: AgentIntentExecutor;
    receiptStore?: AgentActionReceiptStore;
  },
) => {
  const {
    baseTokenUsage,
    conversationState,
    contextPreferences,
    finalizeTurn,
    generateIntentWithAgentModel: modelResolver,
    intentModelEngine,
    message,
    payload,
    pendingAction,
    resolvedHistory,
    structuredConfirmation,
    thread,
    turnId: requestedTurnId,
    user,
    userPreferences,
    workbenchMode,
  } = deps;
  const turnId =
    requestedTurnId ??
    globalThis.crypto?.randomUUID?.() ??
    `agent-turn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const messages = (thread.messages as Array<{ role: string }> | null) ?? [];
  const hasThreadPendingAction = thread.pendingAction != null;
  const autoApproval = {
    isFirstActionInThread:
      messages.length === 0 && !hasThreadPendingAction,
    lastIntent: hasThreadPendingAction ? null : thread.lastIntent,
    pendingActionHistory: (hasThreadPendingAction
      ? [thread.pendingAction as PendingAction]
      : []) as PendingAction[],
    threadId: thread.id,
    userPreferences,
  };
  const threadSummary = toPromptThreadSummary(thread);
  const checkpointer =
    options?.checkpointer ?? getSunnyAgentPostgresSaver();
  const receiptStore =
    options?.receiptStore ??
    createPayloadActionReceiptStore(payload as never);
  const orchestrationExecuteIntent =
    options?.executeIntent ?? executeAgentIntent;

  return async (
    emitStatus: (status: string) => void = () => undefined,
    emitTrace: (step: AgentTraceStep) => void = () => undefined,
    emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void = () =>
      undefined,
    emitToken: StreamTokenCallback = () => undefined,
    emitStage: (event: AgentStreamStageEvent) => void = () => undefined,
    emitProgress: (event: AgentStreamProgressEvent) => void = () => undefined,
    emitChange: (event: AgentStreamChangeEvent) => void = () => undefined,
  ): Promise<AgentChatResponse> => {
    const trace: AgentTraceStep[] = [];
    const stream = createAgentStreamController({
      emitChange,
      emitProgress,
      emitStage,
    });
    let bufferedTurn: BufferedTurn | null = null;
    let currentContextMemories: BuildContextStepResult["context"]["memories"] =
      [];
    let tokenUsage = baseTokenUsage;
    let finalizedResponse: AgentChatResponse | null = null;

    const pushTrace = (step: AgentTraceStep) => {
      const index = trace.findIndex((item) => item.id === step.id);

      if (index === -1) {
        trace.push(step);
      } else {
        trace[index] = { ...trace[index], ...step };
      }

      emitTrace(step);
    };

    const bufferAgentTurn = async (
      turn: BufferedTurn,
    ): Promise<AgentThread> => {
      bufferedTurn = turn;

      return {
        ...thread,
        pendingAction: turn.nextPendingAction,
      } as AgentThread;
    };

    const executeOrchestrationAction = (
      intent: AgentIntent,
      action: import("@/lib/agent/schemas").ProposedAgentAction,
    ) =>
      runIdempotentAgentAction({
        actionId: action.id,
        execute: () =>
          orchestrationExecuteIntent(intent, pushTrace, {
            userId: user.id,
          }),
        intent: intent.intent,
        store: receiptStore,
        threadId: thread.id,
        userId: user.id,
      });
    const executeOrchestrationRollback = ({
      actionId,
      intent,
      rollbackPayload,
    }: {
      actionId: string;
      intent: AgentIntent["intent"];
      rollbackPayload: unknown;
    }) =>
      runIdempotentAgentAction({
        actionId,
        execute: () =>
          executeRollbackFromPayload(rollbackPayload, {
            userId: user.id,
          }),
        intent,
        operation: "rollback",
        store: receiptStore,
        threadId: thread.id,
        userId: user.id,
      });

    const finalizeCompoundResult = async ({
      plan,
      result,
      usage,
    }: {
      plan: import("@/lib/agent/orchestration/types").OrchestratorPlan;
      result: import("@/lib/agent/orchestration/types").ExecutionGraphResult;
      usage: NonNullable<AgentChatResponse["tokenUsage"]>;
    }): Promise<AgentChatResponse> => {
      const observationTrace = buildObservationTraceStep(
        result.observations,
      );

      if (observationTrace) {
        pushTrace(observationTrace);
      }
      pushTrace(buildExecutionDecisionTraceStep(result));

      if (!result.pendingAction) {
        try {
          await projectCompletedOrchestrationToPlan({
            orchestrationId: `orch-${turnId}`,
            payload,
            plan,
            result,
          });
        } catch (error) {
          pushTrace({
            detail:
              error instanceof Error
                ? error.message
                : String(error),
            id: `orchestration-projection-${turnId}`,
            kind: "error",
            status: "error",
            title: "编排业务投影未完成",
          });
        }
      }

      for (const proposal of result.proposals.slice(0, 4)) {
        stream.change({
          collections: Array.from(
            new Set(
              proposal.changes.map(
                (change) => change.collection,
              ),
            ),
          ),
          riskLevel: proposal.riskLevel,
          stageId: "stage-orchestration",
          summary: proposal.summary,
        });
      }
      stream.progress({
        detail: `${result.executedCount} 项已执行，${result.proposals.length} 项待确认。`,
        message: "编排执行图已评估",
        stageId: "stage-orchestration",
      });

      for (const token of splitIntoWordTokens(
        result.assistantMessage,
      )) {
        emitToken(token, "response");
      }

      const outputTokens = estimateTokenCount(
        result.assistantMessage,
      );
      const nextTokenUsage = {
        ...usage,
        outputTokens,
        totalTokens:
          usage.contextTokens +
          usage.inputTokens +
          outputTokens,
      };
      const primaryIntent =
        result.proposals[0]?.intent ??
        result.observations[0]?.intent ??
        plan.tasks[0]?.intent ??
        "answer_question";
      const updatedThread = await bufferAgentTurn({
        assistantMessage: result.assistantMessage,
        confidence: 0.9,
        engine: "workflow",
        intent: primaryIntent,
        nextPendingAction: result.pendingAction,
      });

      tokenUsage = nextTokenUsage;

      return {
        assistantMessage: result.assistantMessage,
        confidence: 0.9,
        engine: "workflow",
        intent: primaryIntent,
        pendingAction: result.pendingAction,
        threadId: updatedThread.id,
        tokenUsage: nextTokenUsage,
        trace,
      };
    };

    const createMountedTaskExecutor = ({
      context,
      input: graphInput,
      plan,
    }: {
      context?: unknown;
      input?: import("@/lib/agent/langgraph/state").SunnyAgentGraphInput;
      plan: import("@/lib/agent/orchestration/types").OrchestratorPlan;
    }) =>
      createNativeOrchestrationTaskExecutor({
        autoApproval,
        dryRunContext: buildOrchestrationDryRunContext({
          context:
            context as BuildContextStepResult["context"],
          payload,
        }),
        executeAction: executeOrchestrationAction,
        executeIntent: (intent) =>
          orchestrationExecuteIntent(intent, pushTrace, {
            userId: user.id,
          }),
        message: graphInput?.message ?? message,
        plan,
        promptContext:
          context as BuildContextStepResult["context"],
      });
    const compoundDependencies: NativeOrchestrationSubgraphDependencies = {
      compensate: async ({ outcomes }) => {
        const messages: string[] = [];

        for (const outcome of [...outcomes].reverse()) {
          const actionId = outcome.observation.actionId;

          if (
            !actionId ||
            outcome.rollbackPayload === undefined
          ) {
            continue;
          }

          try {
            await executeOrchestrationRollback({
              actionId,
              intent: outcome.observation.intent,
              rollbackPayload: outcome.rollbackPayload,
            });
            messages.push(
              `↩ 已补偿「${outcome.observation.label}」。`,
            );
          } catch (error) {
            messages.push(
              `⚠️「${outcome.observation.label}」补偿状态不确定：${
                error instanceof Error
                  ? error.message
                  : String(error)
              }`,
            );

            return { indeterminate: true, messages };
          }
        }

        return { indeterminate: false, messages };
      },
      executeConfirmedAction: (args) =>
        createMountedTaskExecutor(args).executeConfirmedAction!(
          args,
        ),
      executePreparedTask: (args) =>
        createMountedTaskExecutor(args).executePreparedTask(
          args,
        ),
      prepareTask: (args) =>
        createMountedTaskExecutor(args).prepareTask(args),
      repair: async ({ failedObservation, state }) => {
        const failedTask =
          state.taskCatalog.find(
            (task) => task.id === failedObservation.taskId,
          ) ??
          state.plan.tasks.find(
            (task) => task.id === failedObservation.taskId,
          );

        if (!failedTask) {
          return null;
        }

        return (
          buildToolFailureRepairPlan({
            failedTask,
            failureReason:
              failedObservation.error ??
              failedObservation.message,
            message: state.input?.message ?? message,
          })?.plan ?? null
        );
      },
      replan: async ({ failedObservation, state }) => {
        const failedTask =
          state.taskCatalog.find(
            (task) => task.id === failedObservation.taskId,
          ) ??
          state.plan.tasks.find(
            (task) => task.id === failedObservation.taskId,
          );
        const promptContext =
          state.context as BuildContextStepResult["context"];

        if (!failedTask || !promptContext) {
          return null;
        }

        const failedTaskIndex = state.plan.tasks.findIndex(
          (task) => task.id === failedTask.id,
        );

        return replanAfterTaskFailure({
          failedTask,
          failedTaskIndex:
            failedTaskIndex >= 0
              ? failedTaskIndex
              : state.plan.tasks.length - 1,
          failureReason:
            failedObservation.error ??
            failedObservation.message,
          failureType: "tool_error",
          message: state.input?.message ?? message,
          observations: state.outcomes.map(
            (outcome) => outcome.observation,
          ),
          originalPlan: state.plan,
          proposals: state.outcomes.flatMap((outcome) =>
            outcome.proposal ? [outcome.proposal] : [],
          ),
          promptContext,
          queueState: summarizeExecutionQueue(
            state.plan.tasks,
            state.outcomes.map(
              (outcome) => outcome.observation,
            ),
          ),
        });
      },
    };
    const compoundSubgraph =
      compileMountedOrchestrationSubgraph(
        compoundDependencies,
        { maxTasksPerRun: 10 },
      );

    const persistTurn = async (
      response: AgentChatResponse,
    ): Promise<AgentChatResponse> => {
      if (finalizedResponse) {
        return finalizedResponse;
      }

      const turn = bufferedTurn ?? {
        assistantMessage: response.assistantMessage,
        confidence: response.confidence,
        engine: response.engine,
        intent: response.intent,
        nextPendingAction: response.pendingAction,
      };
      const resolvedAssistantMessage =
        response.assistantMessage?.trim() ||
        turn.assistantMessage?.trim() ||
        "我暂时无法生成回答，请检查 Agent 设置中的 API Key 与模型配置后重试。";
      const normalizedTurn = {
        ...turn,
        assistantMessage: resolvedAssistantMessage,
      };
      // #region agent log
      if (process.env.AGENT_DEBUG_LOG) {
        try {
          appendFileSync(
            getAgentDebugLogPath(),
            `${JSON.stringify({
              sessionId: "961715",
              location: "full-adapter.ts:persistTurn",
              message: "persist turn",
              data: {
                bufferedTurnLen: bufferedTurn?.assistantMessage?.length ?? null,
                responseAssistantLen: response.assistantMessage?.length ?? 0,
                resolvedAssistantLen: resolvedAssistantMessage.length,
              },
              timestamp: Date.now(),
              hypothesisId: "H13-H14",
              runId: "post-fix-3",
            })}\n`,
          );
        } catch {
          // ignore debug log failures
        }
      }
      // #endregion
      if (finalizeTurn) {
        const finalized = await finalizeTurn({
          existingMemories: currentContextMemories ?? [],
          conversationStateOverride: normalizedTurn.conversationState,
          pushTrace,
          response: {
            ...response,
            assistantMessage: normalizedTurn.assistantMessage,
            confidence: normalizedTurn.confidence ?? response.confidence,
            engine: normalizedTurn.engine,
            intent: normalizedTurn.intent,
            pendingAction: normalizedTurn.nextPendingAction,
            trace: mergeTrace(response.trace, trace),
            workbenchMode: workbenchMode ?? undefined,
          },
          tokenUsage: response.tokenUsage ?? tokenUsage,
        });
        finalizedResponse = {
          ...finalized,
          trace: mergeTrace(finalized.trace, trace),
        };

        return finalizedResponse;
      }

      emitStatus("正在保存会话上下文...");
      pushTrace({
        detail: "统一写回本轮 LangGraph 响应和 pending 投影。",
        id: "thread-writeback",
        kind: "write",
        status: "running",
        title: "正在保存会话上下文",
      });
      const updatedThread = await steps.appendAgentThreadTurn({
        assistantMessage: normalizedTurn.assistantMessage,
        confidence: normalizedTurn.confidence,
        conversationState: normalizedTurn.conversationState,
        engine: normalizedTurn.engine,
        intent: normalizedTurn.intent,
        pendingAction: normalizedTurn.nextPendingAction,
        thread,
        userMessage: message,
      });
      pushTrace({
        detail: `Thread #${updatedThread.id} 已更新。`,
        id: "thread-writeback",
        kind: "complete",
        status: "done",
        title: "会话上下文已保存",
      });
      await steps.runAgentLearningLoop({
        assistantMessage: normalizedTurn.assistantMessage,
        existingMemories: currentContextMemories ?? [],
        intent: normalizedTurn.intent,
        message,
        pendingActionAfter: normalizedTurn.nextPendingAction,
        pendingActionBefore: pendingAction,
        pushTrace,
        sourceThread: updatedThread.id,
        tokenUsage: response.tokenUsage ?? tokenUsage,
        user,
      });
      finalizedResponse = {
        ...response,
        assistantMessage: normalizedTurn.assistantMessage,
        confidence: normalizedTurn.confidence ?? response.confidence,
        engine: normalizedTurn.engine,
        intent: normalizedTurn.intent,
        pendingAction: normalizedTurn.nextPendingAction,
        threadId: updatedThread.id,
        trace: mergeTrace(response.trace, trace),
        workbenchMode: workbenchMode ?? undefined,
      };

      return finalizedResponse;
    };

    const graphDependencies: FullSunnyAgentGraphDependencies = {
      buildContext: async ({ input: graphInput }) => {
        const result = await steps.runBuildContextStep({
          baseTokenUsage: graphInput.baseTokenUsage,
          contextPreferences: contextPreferences ?? undefined,
          emitStatus,
          emitToken,
          emitUsage,
          message: graphInput.message,
          payload,
          pendingAction: graphInput.pendingAction,
          pushTrace,
          stream,
          threadSummary,
          workbenchMode,
        });
        currentContextMemories = result.context.memories ?? [];
        tokenUsage = result.tokenUsage;

        return result;
      },
      orchestrate: async ({
        context,
        input: graphInput,
        tokenUsage: usage,
      }) => {
        const result = await steps.runOrchestrationStep({
          autoApproval,
          context: context as BuildContextStepResult["context"],
          deferCompoundExecution: true,
          emitStatus,
          emitToken,
          executeAction: executeOrchestrationAction,
          executeRollback: executeOrchestrationRollback,
          message: graphInput.message,
          payload,
          pendingAction: graphInput.pendingAction,
          persistAgentTurn: bufferAgentTurn,
          pushTrace,
          stream,
          tokenUsage: usage,
          trace,
          user,
        });

        if (result.outcome === "early_exit") {
          return { response: result.response, type: "response" };
        }

        tokenUsage = result.data.tokenUsage;

        if (result.outcome === "compound") {
          return {
            plan: result.data.plan,
            tokenUsage,
            type: "compound",
          };
        }

        return {
          orchestratorPlanSource: result.data.orchestratorPlanSource,
          preResolvedIntent: result.data.preResolvedIntent,
          tokenUsage,
          type: "continue",
        };
      },
      finalizeCompound: async ({
        plan,
        result,
        tokenUsage: usage,
      }) =>
        finalizeCompoundResult({
          plan,
          result,
          usage,
        }),
      resolveIntent: async ({
        context,
        input: graphInput,
        orchestratorPlanSource,
        preResolvedIntent,
        tokenUsage: usage,
      }) => {
        const result = await steps.runResolveIntentStep({
          confirmationSignals: resolveConfirmationSignals({
            confirmation: graphInput.structuredConfirmation,
            message: graphInput.message,
            pendingAction: graphInput.pendingAction,
          }),
          context: context as BuildContextStepResult["context"],
          emitStatus,
          emitToken,
          emitUsage,
          intentModelEngine,
          message: graphInput.message,
          modelResolver,
          orchestratorPlanSource,
          pendingAction: graphInput.pendingAction,
          persistAgentTurn: bufferAgentTurn,
          preResolvedIntent,
          pushTrace,
          resolvedHistory,
          stream,
          thread,
          tokenUsage: usage,
          trace,
          user,
          workbenchMode,
        });

        if (result.outcome === "early_exit") {
          return { response: result.response, type: "response" };
        }

        tokenUsage = result.data.tokenUsage;

        return {
          ...result.data,
          tokenUsage,
          type: "continue",
        };
      },
      dryRun: async ({
        context,
        input: graphInput,
        resolution,
        resolutionData,
        tokenUsage: usage,
      }) => {
        if (resolutionData.batchExecuteIntents?.length) {
          return {
            executionApproved: true,
            isDirectAnswer: false,
            tokenUsage: usage,
            type: "continue",
          };
        }

        let nextResolution = resolution;
        let dryRunConversationState: unknown = undefined;
        const planDraftRevision = evaluatePlanDraftRevision({
          intent: resolution.intent,
          pendingAction: graphInput.pendingAction,
          sessionState: conversationState,
          userMessage: graphInput.message,
        });

        if (
          planDraftRevision.status === "revised" ||
          planDraftRevision.status === "missing_draft"
        ) {
          emitStatus(
            planDraftRevision.status === "revised"
              ? "正在更新计划草案..."
              : "当前没有可修改的计划草案...",
          );
          pushTrace(planDraftRevision.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织计划草案修改回复",
          });
          for (const token of splitIntoWordTokens(planDraftRevision.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "计划草案修改回复已生成");

          const outputTokens = estimateTokenCount(planDraftRevision.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: planDraftRevision.assistantMessage,
            confidence: resolution.intent.confidence,
            conversationState: planDraftRevision.sessionState,
            engine: resolution.engine,
            intent: "clarify",
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: planDraftRevision.assistantMessage,
              confidence: resolution.intent.confidence,
              engine: resolution.engine,
              intent: "clarify",
              pendingAction: null,
              planningDraft: planDraftRevision.status === "revised"
                ? planDraftRevision.planningDraft
                : null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        const checklistDraftGeneration = evaluateChecklistDraftGeneration({
          intent: resolution.intent,
          pendingAction: graphInput.pendingAction,
          sessionState: conversationState,
          userMessage: graphInput.message,
        });

        if (
          checklistDraftGeneration.status === "generated" ||
          checklistDraftGeneration.status === "missing_draft" ||
          checklistDraftGeneration.status === "invalid_draft"
        ) {
          emitStatus(
            checklistDraftGeneration.status === "generated"
              ? "正在生成清单草案..."
              : "当前没有可拆解的计划草案...",
          );
          pushTrace(checklistDraftGeneration.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织清单草案回复",
          });
          for (const token of splitIntoWordTokens(checklistDraftGeneration.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "清单草案回复已生成");

          const outputTokens = estimateTokenCount(checklistDraftGeneration.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: checklistDraftGeneration.assistantMessage,
            confidence: resolution.intent.confidence,
            conversationState: checklistDraftGeneration.sessionState,
            engine: resolution.engine,
            intent: checklistDraftGeneration.intent,
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: checklistDraftGeneration.assistantMessage,
              confidence: resolution.intent.confidence,
              engine: resolution.engine,
              intent: checklistDraftGeneration.intent,
              pendingAction: null,
              planningChecklistDraft: checklistDraftGeneration.status === "generated"
                ? checklistDraftGeneration.planningChecklistDraft
                : null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        const checklistCreationPreparation = evaluateChecklistCreationPreparation({
          intent: resolution.intent,
          sessionState: conversationState,
          userMessage: graphInput.message,
        });

        if (
          checklistCreationPreparation.status === "missing_draft" ||
          checklistCreationPreparation.status === "invalid_draft"
        ) {
          emitStatus("当前没有可创建的清单草案，需要先生成草案...");
          pushTrace(checklistCreationPreparation.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织清单草案提示",
          });
          for (const token of splitIntoWordTokens(checklistCreationPreparation.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "清单草案提示已生成");

          const outputTokens = estimateTokenCount(checklistCreationPreparation.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: checklistCreationPreparation.assistantMessage,
            confidence: resolution.intent.confidence,
            conversationState: checklistCreationPreparation.sessionState,
            engine: resolution.engine,
            intent: "clarify",
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: checklistCreationPreparation.assistantMessage,
              confidence: resolution.intent.confidence,
              engine: resolution.engine,
              intent: "clarify",
              pendingAction: null,
              planningChecklistDraft: checklistCreationPreparation.sessionState.planning?.checklistDraft ?? null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        if (checklistCreationPreparation.status === "prepared") {
          pushTrace(checklistCreationPreparation.traceStep);
          nextResolution = applyChecklistCreationPreparationToResolution(
            resolution,
            checklistCreationPreparation,
          );
          dryRunConversationState = checklistCreationPreparation.sessionState;
        }

        const planCreationPreparation = checklistCreationPreparation.status === "prepared"
          ? { reason: "not_prepare_request" as const, status: "not_prepare" as const }
          : evaluatePlanCreationPreparation({
              intent: nextResolution.intent,
              sessionState: conversationState,
              userMessage: graphInput.message,
            });

        if (
          planCreationPreparation.status === "missing_draft" ||
          planCreationPreparation.status === "invalid_draft"
        ) {
          emitStatus("当前没有可创建的计划草案，需要先生成草案...");
          pushTrace(planCreationPreparation.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织计划草案提示",
          });
          for (const token of splitIntoWordTokens(planCreationPreparation.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "计划草案提示已生成");

          const outputTokens = estimateTokenCount(planCreationPreparation.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: planCreationPreparation.assistantMessage,
            confidence: resolution.intent.confidence,
            conversationState: planCreationPreparation.sessionState,
            engine: resolution.engine,
            intent: "clarify",
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: planCreationPreparation.assistantMessage,
              confidence: resolution.intent.confidence,
              engine: resolution.engine,
              intent: "clarify",
              pendingAction: null,
              planningDraft: planCreationPreparation.sessionState.planning?.draft ?? null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        if (planCreationPreparation.status === "prepared") {
          pushTrace(planCreationPreparation.traceStep);
          nextResolution = applyPlanCreationPreparationToResolution(
            resolution,
            planCreationPreparation,
          );
          dryRunConversationState = planCreationPreparation.sessionState;
        }

        const scheduleDraftRevision = evaluateScheduleDraftRevision({
          intent: nextResolution.intent,
          pendingAction: graphInput.pendingAction,
          referenceDate: (context as BuildContextStepResult["context"]).now,
          sessionState: dryRunConversationState ?? conversationState,
          userMessage: graphInput.message,
        });

        if (
          scheduleDraftRevision.status === "revised" ||
          scheduleDraftRevision.status === "needs_clarification" ||
          scheduleDraftRevision.status === "missing_draft"
        ) {
          emitStatus(
            scheduleDraftRevision.status === "revised"
              ? "正在更新日程草案..."
              : "日程草案修改需要先澄清...",
          );
          pushTrace(scheduleDraftRevision.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织日程草案修改回复",
          });
          for (const token of splitIntoWordTokens(scheduleDraftRevision.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "日程草案修改回复已生成");

          const outputTokens = estimateTokenCount(scheduleDraftRevision.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: scheduleDraftRevision.assistantMessage,
            confidence: nextResolution.intent.confidence,
            conversationState: scheduleDraftRevision.sessionState,
            engine: nextResolution.engine,
            intent: "clarify",
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: scheduleDraftRevision.assistantMessage,
              confidence: nextResolution.intent.confidence,
              engine: nextResolution.engine,
              intent: "clarify",
              pendingAction: null,
              schedulingDraft: scheduleDraftRevision.status === "revised"
                ? scheduleDraftRevision.schedulingDraft
                : null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        const scheduleCreationPreparation = checklistCreationPreparation.status === "prepared" ||
          planCreationPreparation.status === "prepared"
          ? { reason: "not_prepare_request" as const, status: "not_prepare" as const }
          : evaluateScheduleCreationPreparation({
              intent: nextResolution.intent,
              sessionState: dryRunConversationState ?? conversationState,
              userMessage: graphInput.message,
            });

        if (
          scheduleCreationPreparation.status === "missing_draft" ||
          scheduleCreationPreparation.status === "invalid_draft"
        ) {
          emitStatus("当前没有可创建的日程草案，需要先生成草案...");
          pushTrace(scheduleCreationPreparation.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织日程草案提示",
          });
          for (const token of splitIntoWordTokens(scheduleCreationPreparation.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "日程草案提示已生成");

          const outputTokens = estimateTokenCount(scheduleCreationPreparation.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: scheduleCreationPreparation.assistantMessage,
            confidence: resolution.intent.confidence,
            conversationState: scheduleCreationPreparation.sessionState,
            engine: resolution.engine,
            intent: "clarify",
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: scheduleCreationPreparation.assistantMessage,
              confidence: resolution.intent.confidence,
              engine: resolution.engine,
              intent: "clarify",
              pendingAction: null,
              schedulingDraft: scheduleCreationPreparation.sessionState.scheduling?.draft ?? null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        if (scheduleCreationPreparation.status === "prepared") {
          pushTrace(scheduleCreationPreparation.traceStep);
          nextResolution = applyScheduleCreationPreparationToResolution(
            nextResolution,
            scheduleCreationPreparation,
          );
          dryRunConversationState = scheduleCreationPreparation.sessionState;
        }

        const planReadinessGate = planCreationPreparation.status === "prepared"
          ? { gateApplied: false as const, reason: "ready_enough" as const }
          : evaluatePlanReadinessGate({
              confirmedActionId: resolutionData.confirmedActionId ?? null,
              intent: nextResolution.intent,
              sessionState: conversationState,
              sessionSlots: extractPlanSlotsFromSessionState(conversationState),
              userMessage: graphInput.message,
            });

        if (planReadinessGate.gateApplied) {
          emitStatus("计划上下文不足，需要先澄清关键问题...");
          pushTrace(planReadinessGate.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织计划澄清回复",
          });
          for (const token of splitIntoWordTokens(planReadinessGate.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "计划澄清回复已生成");

          const outputTokens = estimateTokenCount(planReadinessGate.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: planReadinessGate.assistantMessage,
            confidence: planReadinessGate.readiness.confidence,
            conversationState: planReadinessGate.sessionState,
            engine: resolution.engine,
            intent: planReadinessGate.intent,
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: planReadinessGate.assistantMessage,
              confidence: planReadinessGate.readiness.confidence,
              engine: resolution.engine,
              intent: planReadinessGate.intent,
              pendingAction: null,
              planningDraft: planReadinessGate.planningDraft ?? null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        const scheduleReadinessGate = scheduleCreationPreparation.status === "prepared"
          ? { gateApplied: false as const, reason: "ready_without_gate" as const }
          : evaluateScheduleReadinessGate({
              confirmedActionId: resolutionData.confirmedActionId ?? null,
              intent: nextResolution.intent,
              sessionState: conversationState,
              userMessage: graphInput.message,
            });

        if (scheduleReadinessGate.gateApplied) {
          emitStatus("日程上下文需要先补齐...");
          pushTrace(scheduleReadinessGate.traceStep);
          stream.start({
            id: "stage-response",
            phase: "response",
            title: "组织日程澄清回复",
          });
          for (const token of splitIntoWordTokens(scheduleReadinessGate.assistantMessage)) {
            emitToken(token, "response");
          }
          stream.complete("stage-response", "日程澄清回复已生成");

          const outputTokens = estimateTokenCount(scheduleReadinessGate.assistantMessage);
          const nextTokenUsage = {
            ...usage,
            outputTokens,
            totalTokens: usage.contextTokens + usage.inputTokens + outputTokens,
          };
          const updatedThread = await bufferAgentTurn({
            assistantMessage: scheduleReadinessGate.assistantMessage,
            confidence: scheduleReadinessGate.readiness.confidence,
            conversationState: scheduleReadinessGate.sessionState,
            engine: resolution.engine,
            intent: scheduleReadinessGate.intent,
            nextPendingAction: null,
          });

          tokenUsage = nextTokenUsage;

          return {
            response: {
              assistantMessage: scheduleReadinessGate.assistantMessage,
              confidence: scheduleReadinessGate.readiness.confidence,
              engine: resolution.engine,
              intent: scheduleReadinessGate.intent,
              pendingAction: null,
              planningDraft: null,
              schedulingDraft: scheduleReadinessGate.scheduleDraft ?? null,
              threadId: updatedThread.id,
              tokenUsage: nextTokenUsage,
              trace,
            },
            type: "response",
          };
        }

        const result = await steps.runDryRunAndProposeStep({
          autoApproval,
          confirmedActionId: resolutionData.confirmedActionId ?? null,
          context: context as BuildContextStepResult["context"],
          conversationState: dryRunConversationState,
          emitStatus,
          emitToken,
          payload,
          persistAgentTurn: bufferAgentTurn,
          pushTrace,
          resolution: nextResolution,
          stream,
          tokenUsage: usage,
          trace,
          user,
        });

        if (result.outcome === "early_exit") {
          return { response: result.response, type: "response" };
        }

        tokenUsage = result.data.tokenUsage;

        return { ...result.data, type: "continue" };
      },
      execute: async ({
        dryRun,
        input: graphInput,
        resolution,
        resolutionData,
        tokenUsage: usage,
      }) => {
        // #region agent log
        if (process.env.AGENT_DEBUG_LOG) {
          try {
            appendFileSync(
              getAgentDebugLogPath(),
              `${JSON.stringify({
                sessionId: "961715",
                location: "full-adapter.ts:execute",
                message: "langgraph execute node",
                data: {
                  intent: resolution.intent.intent,
                  replyLen:
                    "reply" in resolution.intent ? resolution.intent.reply?.length ?? null : null,
                  isDirectAnswer: dryRun.isDirectAnswer,
                },
                timestamp: Date.now(),
                hypothesisId: "H12",
                runId: "post-fix-3",
              })}\n`,
            );
          } catch {
            // ignore debug log failures
          }
        }
        // #endregion
        const executeStep = () =>
          steps.runExecuteAndPersistStep({
            batchExecuteIntents: resolutionData.batchExecuteIntents,
            confirmedActionId: resolutionData.confirmedActionId ?? null,
            conversationState: dryRun.conversationState ?? conversationState,
            emitStatus,
            emitToken,
            executionApproved: dryRun.executionApproved,
            isDirectAnswer: dryRun.isDirectAnswer,
            nextPendingAfterExecute:
              resolutionData.nextPendingAfterExecute ?? undefined,
            persistAgentTurn: bufferAgentTurn,
            pushTrace,
            resolution,
            stream,
            tokenUsage: usage,
            trace,
            user,
          });
        const actionId =
          resolutionData.confirmedActionId ??
          dryRun.approvedActionId ??
          null;
        const response = actionId
          ? await runIdempotentAgentAction({
              actionId,
              execute: executeStep,
              intent: resolution.intent.intent,
              store: receiptStore,
              threadId: thread.id,
              userId: user.id,
            })
          : await executeStep();
        tokenUsage = response.tokenUsage ?? usage;

        try {
          await projectConfirmedOrchestrationToPlan({
            payload,
            pendingAction: graphInput.pendingAction,
          });
        } catch (error) {
          pushTrace({
            detail:
              error instanceof Error
                ? error.message
                : String(error),
            id: `orchestration-confirmed-projection-${graphInput.turnId}`,
            kind: "error",
            status: "error",
            title: "确认后的编排投影未完成",
          });
        }

        return response;
      },
      finalize: ({ response }) => persistTurn(response),
    };
    const graph = compileFullSunnyAgentGraph(graphDependencies, {
      checkpointer,
      compoundSubgraph,
    });
    const checkpointConfig = buildSunnyAgentCheckpointConfig({
      threadId: thread.id,
      userId: user.id,
    });
    emitUsage(tokenUsage);
    emitToken("正在通过 LangGraph 分析你的请求...\n", "thinking");
    const openDomainDefinition = parseDefinitionQuestionIntent(message);
    const forceFreshPipeline =
      openDomainDefinition?.intent === "answer_question" &&
      Boolean(openDomainDefinition.args.openDomainTopic);
    const effectivePendingAction = forceFreshPipeline ? null : pendingAction;
    const initialInput = {
      compoundPlan: null,
      compoundResult: null,
      context: null,
      contextSummary: null,
      dryRunData: null,
      failureMessage: null,
      input: {
        baseTokenUsage,
        message,
        pendingAction: effectivePendingAction,
        resolvedHistory,
        structuredConfirmation,
        threadId: thread.id,
        turnId,
        userId: user.id,
      },
      orchestratorPlanSource: null,
      preResolvedIntent: null,
      resolution: null,
      resolutionData: null,
      response: null,
      tokenUsage: baseTokenUsage,
      trace: [],
    };
    let result;
    const checkpointState = await graph.getState(checkpointConfig);
    const hasCheckpointInterrupt =
      checkpointState.next.includes("await_user") ||
      checkpointState.tasks.some((task) => task.interrupts.length > 0);
    const invokeGraph = async (...args: Parameters<typeof graph.invoke>) => {
      bufferedTurn = null;
      return graph.invoke(...args);
    };

    const hasUsableGraphResponse = (
      value: AgentChatResponse | null | undefined,
    ): value is AgentChatResponse =>
      Boolean(value?.assistantMessage?.trim());

    const isStaleResumeResponse = (value: AgentChatResponse | null | undefined) =>
      hasUsableGraphResponse(value) && value.turnId != null && value.turnId !== turnId;

    if ((hasCheckpointInterrupt || pendingAction) && !forceFreshPipeline) {
      try {
        result = await invokeGraph(
          new Command({
            resume: {
              message,
              structuredConfirmation,
              baseTokenUsage,
              turnId,
            },
          }),
          checkpointConfig,
        );

        const willFallbackToInitial =
          (!hasUsableGraphResponse(result.response) || isStaleResumeResponse(result.response)) &&
          !getInterruptedAgentResponse(result);

        // #region agent log
        if (process.env.AGENT_DEBUG_LOG) {
          try {
            appendFileSync(
              getAgentDebugLogPath(),
              `${JSON.stringify({
                sessionId: "961715",
                location: "full-adapter.ts:resume-invoke",
                message: "langgraph resume invoke result",
                data: {
                  hasPendingAction: Boolean(pendingAction),
                  hasCheckpointInterrupt,
                  forceFreshPipeline,
                  resumeAssistantLen: result.response?.assistantMessage?.length ?? 0,
                  resumeTurnId: result.response?.turnId ?? null,
                  currentTurnId: turnId,
                  staleResume: isStaleResumeResponse(result.response),
                  willFallbackToInitial,
                },
                timestamp: Date.now(),
                hypothesisId: "H16-H17",
                runId: "post-fix-5",
              })}\n`,
            );
          } catch {
            // ignore debug log failures
          }
        }
        // #endregion

        if (willFallbackToInitial) {
          result = await invokeGraph(initialInput, checkpointConfig);
        }
      } catch (error) {
        if (!(error instanceof EmptyInputError)) {
          throw error;
        }

        result = await invokeGraph(initialInput, checkpointConfig);
      }
    } else {
      // #region agent log
      if (process.env.AGENT_DEBUG_LOG) {
        try {
          appendFileSync(
            getAgentDebugLogPath(),
            `${JSON.stringify({
              sessionId: "961715",
              location: "full-adapter.ts:fresh-invoke",
              message: "langgraph fresh pipeline invoke",
              data: {
                forceFreshPipeline,
                hasPendingAction: Boolean(pendingAction),
                hasCheckpointInterrupt,
                currentTurnId: turnId,
              },
              timestamp: Date.now(),
              hypothesisId: "H17",
              runId: "post-fix-5",
            })}\n`,
          );
        } catch {
          // ignore debug log failures
        }
      }
      // #endregion
      result = await invokeGraph(initialInput, checkpointConfig);
    }
    const interruptedCompound =
      getInterruptedCompoundResult(result);

    if (interruptedCompound) {
      return persistTurn(
        await finalizeCompoundResult({
          plan: interruptedCompound.plan,
          result: interruptedCompound.result,
          usage: tokenUsage,
        }),
      );
    }
    const interruptedResponse = getInterruptedAgentResponse(result);

    if (interruptedResponse) {
      return persistTurn(interruptedResponse);
    }

    const graphResponse = result.response as AgentChatResponse | null | undefined;

    if (!graphResponse) {
      throw new Error("LangGraph did not produce a response.");
    }

    // #region agent log
    if (process.env.AGENT_DEBUG_LOG) {
      try {
        appendFileSync(
          getAgentDebugLogPath(),
          `${JSON.stringify({
            sessionId: "961715",
            location: "full-adapter.ts:graph-result",
            message: "langgraph invoke completed",
            data: {
              assistantMessageLen: graphResponse.assistantMessage?.length ?? 0,
              bufferedTurnLen: (bufferedTurn as BufferedTurn | null)?.assistantMessage?.length ?? null,
            },
            timestamp: Date.now(),
            hypothesisId: "H14",
            runId: "post-fix-3",
          })}\n`,
        );
      } catch {
        // ignore debug log failures
      }
    }
    // #endregion

    return graphResponse;
  };
};
