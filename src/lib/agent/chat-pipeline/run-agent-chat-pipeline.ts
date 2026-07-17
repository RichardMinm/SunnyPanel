import type { Payload } from "payload";

import { recordAgentFailure } from "@/lib/agent/audit";
import type { generateIntentWithAgentModel, StreamTokenCallback } from "@/lib/agent/client";
import { runBuildContextStep } from "@/lib/agent/chat-pipeline/build-context-step";
import { runDryRunAndProposeStep } from "@/lib/agent/chat-pipeline/dry-run-and-propose-step";
import { runExecuteAndPersistStep } from "@/lib/agent/chat-pipeline/execute-and-persist-step";
import { runOrchestrationStep } from "@/lib/agent/chat-pipeline/orchestration-step";
import {
  resolveConfirmationSignals,
  type StructuredConfirmation,
} from "@/lib/agent/chat-pipeline/confirmation-step";
import { runResolveIntentStep } from "@/lib/agent/chat-pipeline/resolve-intent-step";
import { createLoopController } from "@/lib/agent/chat-pipeline/loop-controller";
import { logAgentEvent } from "@/lib/agent/logger";
import type { AgentThread } from "@/payload-types";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import {
  type AgentChatMessage,
  type AgentChatResponse,
  type AgentEngine,
  type AgentIntent,
  type AgentTraceStep,
  type AgentWriteIntentName,
  type PendingAction,
} from "@/lib/agent/schemas";
import { appendAgentThreadTurn } from "@/lib/agent/thread";
import { toPromptThreadSummary } from "@/lib/agent/thread-summary";
import { runAgentLearningLoop } from "@/lib/agent/learning-loop";
import type { ContextPreferences } from "@/lib/agent/chat-pipeline/handle-agent-chat-post";
import type { UserPreferences } from "@/lib/agent/user-preferences";
import type { AgentTurnFinalizer } from "@/lib/agent/turn-finalizer";
import type { AgentPromptContext } from "@/lib/agent/prompts";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";
import {
  createAgentStreamController,
  type AgentStreamChangeEvent,
  type AgentStreamProgressEvent,
  type AgentStreamStageEvent,
} from "@/lib/agent/stream-events";
import { normalizeRouterOutput } from "@/lib/agent/router/normalize-router-output";
import { evaluatePolicyGuard } from "@/lib/agent/policy/tool-gate";
import { applyPolicyGuard } from "@/lib/agent/policy/guard";
import { getAllowedCapabilities } from "@/lib/agent/capabilities/tool-gate";
import { buildToolPlan } from "@/lib/agent/plan/tool-plan";
import { agentRouterToLLMRouter } from "@/lib/agent/router/llm-router-to-agent-router";
import { dispatchWorkflow } from "@/lib/agent/workflow/router";
import {
  assertPlannedVsActual,
  capabilityNameForIntent,
  createEmptyTurnTrace,
  pendingActionToConfirmationState,
  recordActualTool,
  recordCapabilityGateTrace,
  recordPolicyGuardOutputTrace,
  recordPolicyTrace,
  recordRawUserInputTrace,
  recordRouterTrace,
  recordToolPlanTrace,
  type AgentTurnTrace,
} from "@/lib/agent/trace/agent-turn-trace";
import {
  sanitizeAgentTraceEvent,
  type AgentTraceEventInput,
  type AgentTraceEventPayload,
} from "@/lib/agent/trace";
import type { AgentPerformanceTimer } from "@/lib/agent/trace/perf-trace";
import {
  resolveContextLoadingPolicy,
  getRequiredSectionsForIntent,
  getMissingSectionsForSecondPass,
  mergeSectionsForSecondPass,
  isContextLoadingPolicyEnabled,
  type ContextLoadingMeta,
} from "@/lib/agent/context-loading-policy";
import {
  evaluatePlanReadinessGate,
  extractPlanSlotsFromSessionState,
  composePlanClarificationAsync,
} from "@/lib/agent/planning/readiness-gate";
import {
  evaluateScheduleReadinessGate,
  composeScheduleClarificationAsync,
} from "@/lib/agent/schedule/readiness-gate";
import { extractSlotsWithLLM, mergeLLMSlots } from "@/lib/agent/schedule/slot-extraction";
import { humanSourceLabel } from "@/lib/agent/response/clarification";
import {
  checkAgentLLMAvailability,
  buildLLMUnavailableAgentResponse,
  isAgentRequireLLMEnabled,
} from "@/lib/agent/llm-required";
import {
  isAgentToolPlannerGraphRuntimeEnabled,
  isAgentToolPlannerTraceOnlyEnabled,
  isAgentToolPlannerRealPendingActionEnabled,
  runToolPlannerGraphRuntime,
  runToolPlannerShadowGraph,
  buildToolPlannerUnavailableAgentResponse,
} from "@/lib/agent/tool-planner";
import { classifyScheduleIntentBoundary } from "@/lib/agent/schedule/intent-boundary";
import {
  formatScheduleQueryAssistantMessage,
  inferScheduleQueryRangeLabel,
} from "@/lib/agent/schedule/query-summary";
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
import {
  estimateTokenCount,
  splitIntoWordTokens,
} from "@/lib/agent/token-usage";

export type RunAgentChatPipelineDeps = {
  baseTokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  contextPreferences?: ContextPreferences | null;
  conversationState?: import("@/lib/agent/conversation/types").AgentConversationState | null;
  finalizeTurn?: AgentTurnFinalizer;
  generateIntentWithAgentModel: typeof generateIntentWithAgentModel;
  intentModelEngine: AgentEngine;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  payload: Payload;
  pendingAction: null | PendingAction;
  /** Performance timer (null when AGENT_PERF_TRACE≠1) */
  perfTimer?: AgentPerformanceTimer | null;
  resolvedHistory: AgentChatMessage[];
  structuredConfirmation: null | StructuredConfirmation;
  thread: AgentThread;
  user: { id: number };
  userPreferences?: UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
  turnId?: string;
};

export const createRunAgentChatPipeline = (deps: RunAgentChatPipelineDeps) => {
  const {
    baseTokenUsage,
    contextPreferences,
    conversationState = null,
    finalizeTurn,
    generateIntentWithAgentModel: modelResolver,
    intentModelEngine,
    message,
    modelCallRecorder,
    payload,
    pendingAction,
    perfTimer = null,
    resolvedHistory,
    structuredConfirmation,
    thread,
    user,
    userPreferences,
    workbenchMode,
  } = deps;

  const messages = (thread.messages as Array<{ role: string }> | null) ?? [];
  const threadSummary = toPromptThreadSummary(thread);
  const hasMessageHistory = messages.length > 0;
  const hasPendingAction = thread.pendingAction != null;
  const isFirstActionInThread = !hasMessageHistory && !hasPendingAction;

  const autoApproval = {
    isFirstActionInThread,
    // Only treat lastIntent as confirmed when pendingAction is null —
    // a non-null pendingAction means the last turn proposed (not executed) an action.
    lastIntent: hasPendingAction ? null : thread.lastIntent,
    pendingActionHistory: (hasPendingAction ? [thread.pendingAction as PendingAction] : []) as PendingAction[],
    threadId: thread.id,
    userPreferences,
  };

  return async (
    emitStatus: (status: string) => void = () => undefined,
    emitTrace: (step: AgentTraceStep) => void = () => undefined,
    emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void = () => undefined,
    emitToken: StreamTokenCallback = () => undefined,
    emitStage: (event: AgentStreamStageEvent) => void = () => undefined,
    emitProgress: (event: AgentStreamProgressEvent) => void = () => undefined,
    emitChange: (event: AgentStreamChangeEvent) => void = () => undefined,
    emitActivity: (event: AgentTraceEventPayload) => void = () => undefined,
  ): Promise<AgentChatResponse> => {
    const trace: AgentTraceStep[] = [];
    const backendTraceEvents: AgentTraceEventPayload[] = [];
    const turnAudit: AgentTurnTrace = createEmptyTurnTrace(deps.turnId);
    Object.assign(turnAudit, recordRawUserInputTrace(turnAudit, message));
    const recordBackendTrace = (event: AgentTraceEventInput) => {
      const traceEvent = sanitizeAgentTraceEvent({
        createdAt: new Date().toISOString(),
        threadId: String(thread.id),
        ...event,
      });

      backendTraceEvents.push(traceEvent);

      try {
        emitActivity(traceEvent);
      } catch {
        // Activity streaming is best-effort and must not alter Agent behavior.
      }
    };
    const backendTraceKey = (event: AgentTraceEventPayload) =>
      [
        event.createdAt ?? "",
        event.phase,
        event.status,
        event.title,
        event.actionId ?? "",
        event.intent ?? "",
      ].join("|");
    const mergeBackendTraceEvents = (existing: AgentTraceEventPayload[] = []) => {
      const merged = new Map<string, AgentTraceEventPayload>();

      for (const event of [...existing, ...backendTraceEvents]) {
        merged.set(backendTraceKey(event), event);
      }

      return [...merged.values()];
    };
    const attachMeta = (response: AgentChatResponse): AgentChatResponse => ({
      ...response,
      backendTraceEvents: mergeBackendTraceEvents(response.backendTraceEvents),
      turnAudit,
      workbenchMode: workbenchMode ?? undefined,
    });
    const stream = createAgentStreamController({
      emitChange,
      emitProgress,
      emitStage,
    });
    const pushTrace = (step: AgentTraceStep) => {
      const index = trace.findIndex((item) => item.id === step.id);

      if (index === -1) {
        trace.push(step);
      } else {
        trace[index] = {
          ...trace[index],
          ...step,
        };
      }

      emitTrace(step);
    };
    const errorSummaryForTrace = (error: unknown) => ({
      message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && error.name ? { name: error.name } : {}),
    });

    recordBackendTrace({
      inputPreview: {
        messageLength: message.length,
        workbenchMode: workbenchMode ?? null,
      },
      phase: "user_message",
      status: "success",
      title: "收到用户请求",
    });

    /** Phase timing helper — no-op when perfTimer is null */
    const timePhase = async <T>(
      name: string,
      topLevel: import("@/lib/agent/trace/perf-trace").TopLevelPhaseName,
      fn: () => Promise<T>,
    ): Promise<T> => {
      if (!perfTimer) return fn();
      perfTimer.startPhase(name);
      try {
        const result = await fn();
        const duration = perfTimer.endPhase(name, true);
        perfTimer.recordTopLevelPhase(topLevel, duration);
        return result;
      } catch (err) {
        const duration = perfTimer.endPhase(name, false, err instanceof Error ? err.message : String(err));
        perfTimer.recordTopLevelPhase(topLevel, duration, true);
        throw err;
      }
    };
    let bufferedTurn: {
      assistantMessage: string;
      confidence?: number;
      conversationState?: unknown;
      engine: AgentEngine;
      intent: AgentIntent["intent"];
      nextPendingAction: null | PendingAction;
    } | null = null;
    const persistAgentTurn = async ({
      assistantMessage,
      confidence,
      conversationState: nextConversationState,
      engine,
      intent,
      nextPendingAction,
    }: {
      assistantMessage: string;
      confidence?: number;
      conversationState?: unknown;
      engine: AgentEngine;
      intent: AgentIntent["intent"];
      nextPendingAction: null | PendingAction;
    }) => {
      if (finalizeTurn) {
        bufferedTurn = {
          assistantMessage,
          confidence,
          conversationState: nextConversationState,
          engine,
          intent,
          nextPendingAction,
        };

        return {
          ...thread,
          pendingAction: nextPendingAction,
        } as AgentThread;
      }

      emitStatus("正在保存会话上下文...");
      pushTrace({
        detail: "会把这轮用户输入、Agent 回复和待处理动作一起写回 AgentThread。",
        id: "thread-writeback",
        kind: "write",
        status: "running",
        title: "正在保存会话上下文",
      });
      const updatedThread = await appendAgentThreadTurn({
        assistantMessage,
        confidence,
        conversationState: nextConversationState,
        engine,
        intent,
        pendingAction: nextPendingAction,
        thread,
        userMessage: message,
      });
      pushTrace({
        detail: `Thread #${updatedThread.id} 已更新，可继续承接这轮上下文。`,
        id: "thread-writeback",
        kind: "complete",
        status: "done",
        title: "会话上下文已保存",
      });
      await runAgentLearningLoop({
        assistantMessage,
        existingMemories: currentContextMemories,
        intent,
        message,
        pendingActionAfter: nextPendingAction,
        pendingActionBefore: currentPendingAction,
        pushTrace,
        sourceThread: updatedThread.id,
        tokenUsage,
        user,
      });

      return updatedThread;
    };

    const controller = createLoopController({ emitStatus, emitToken, emitTrace, emitUsage });
    let tokenUsage = baseTokenUsage;
    let currentContextMemories: AgentPromptContext["memories"] = [];
    let currentPendingAction = pendingAction;
    emitUsage(tokenUsage);

    // ── LLM Required Mode: availability check ──
    const llmAvailability = await checkAgentLLMAvailability();
    if (!llmAvailability.available) {
      recordBackendTrace({
        outputPreview: { reason: llmAvailability.reason },
        phase: "llm_availability",
        status: "failed",
        summary: "LLM required but unavailable",
        title: "LLM 不可用，pipeline 停止",
      });
      emitStatus("Agent 需要模型配置后才能继续");
      emitToken("当前 Agent 需要 LLM 才能处理这个请求。请检查模型配置后重试。\n", "response");
      return attachMeta(
        buildLLMUnavailableAgentResponse({
          reason: llmAvailability.reason,
          threadId: thread.id,
        }),
      );
    }

    // Emit placeholder immediately so the user sees content without waiting
    emitToken("正在分析你的请求...\n", 'thinking');

    // Build context once (refreshed per-loop iteration when needed)
    const policyOn = isContextLoadingPolicyEnabled();

    const loadingPolicy = resolveContextLoadingPolicy({
      workbenchMode,
      message,
      pendingAction,
      lastIntent: thread.lastIntent as string | null,
    });

    /* Determine sections to load:
     *   policyOn=true   → sections from the policy (selective load)
     *   policyShadow    → null (full load + log would-be sections)
     *   otherwise       → null (full load, no policy computation)
     */
    const effectiveSections = policyOn
      ? loadingPolicy.sections
      : null;  // full load for shadow and off modes

    stream.start({
      id: "stage-context",
      phase: "context",
      title: "构建上下文",
    });
    stream.progress({
      detail: `读取工作区数据（策略: ${loadingPolicy.meta.reason}, level=${loadingPolicy.meta.level}, sections=[${[...loadingPolicy.sections].join(",")}]）`,
      message: "加载工作区数据",
      stageId: "stage-context",
    });
    let contextStep = await timePhase("contextBuilder", "context", () =>
      runBuildContextStep({
        baseTokenUsage,
        contextPreferences: contextPreferences ?? undefined,
        emitStatus,
        emitToken,
        emitUsage,
        loadingSections: effectiveSections,
        dateRange: loadingPolicy.meta.dateRange,
        targetDocument: loadingPolicy.meta.targetDocument,
        message,
        payload,
        pendingAction,
        pushTrace,
        stream,
        threadSummary,
        workbenchMode,
      }),
    );

    /* Attach context loading meta for second-pass and observability */
    let contextLoadingMeta: ContextLoadingMeta = {
      ...loadingPolicy.meta,
      loadedSections: effectiveSections ? [...effectiveSections] : loadingPolicy.meta.sections,
      skippedSections: effectiveSections
        ? loadingPolicy.meta.sections.filter((s) => !effectiveSections.has(s))
        : [],
    };
    stream.progress({
      detail: [
        `${contextStep.context.plans.length} 个计划`,
        `${contextStep.context.checklists.length} 份清单`,
        `${contextStep.context.memories?.length ?? 0} 条记忆`,
      ].join(" · "),
      message: "上下文快照已生成",
      stageId: "stage-context",
    });
    stream.complete("stage-context", "上下文已就绪");
    const { context: initialContext, contextSummary } = contextStep;
    recordBackendTrace({
      outputPreview: {
        checklistsCount: initialContext.checklists.length,
        memoriesCount: initialContext.memories?.length ?? 0,
        plansCount: initialContext.plans.length,
        schedulesCount: initialContext.schedules?.length ?? 0,
      },
      phase: "session",
      status: "success",
      summary: "上下文快照已加载。",
      title: "上下文已就绪",
    });
    currentContextMemories = initialContext.memories ?? [];
    tokenUsage = contextStep.tokenUsage;
    controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);

    // ── R4B/R4A/R4D/R5-A: Tool Planner ──
    // R4D: await graph runtime, check for real PendingAction (early exit if valid)
    // R5-A: in AGENT_REQUIRE_LLM=1, always await graph runtime to gate heuristic fallback
    // R4B: graph runtime trace-only (fire-and-forget when R4D off AND require mode off)
    // R4A: shadow runner trace-only (fire-and-forget)
    let toolPlannerRealPending: Awaited<ReturnType<typeof runToolPlannerGraphRuntime>>["realPendingAction"] = undefined;
    let toolPlannerAssistantMessage: string | undefined;
    /** R5-A: track graph failure for controlled rejection in require mode. */
    let toolPlannerGraphFailed = false;
    let toolPlannerGraphError: { code?: string; message?: string } | undefined;

    if (isAgentToolPlannerGraphRuntimeEnabled()) {
      // R5-A: in require mode, always await graph runtime even without R4D flag
      const shouldAwaitGraph = isAgentToolPlannerRealPendingActionEnabled() || isAgentRequireLLMEnabled();
      if (shouldAwaitGraph) {
        // R4D / R5-A: await graph runtime — may produce real PendingAction
        try {
          const result = await runToolPlannerGraphRuntime({
            currentDate: new Date().toISOString().split("T")[0],
            sessionId: String(thread.id),
            userMessage: message,
          });
          for (const event of result.traceEvents) {
            event.threadId = String(thread.id);
            recordBackendTrace(event);
          }
          toolPlannerGraphFailed = result.status === "failed";
          toolPlannerGraphError = result.error;
          if (result.realPendingAction) {
            toolPlannerRealPending = result.realPendingAction;
            toolPlannerAssistantMessage = result.assistantMessage;
          } else if (result.assistantMessage) {
            // R5-B: capture read/draft assistant message even without write proposal
            toolPlannerAssistantMessage = result.assistantMessage;
          }
        } catch {
          // Graph runtime failure must NEVER affect the main pipeline.
          toolPlannerGraphFailed = true;
          toolPlannerGraphError = { code: "graph_runtime_error", message: "Tool Planner graph runtime threw an unexpected error." };
        }
      } else {
        // R4B trace-only: fire-and-forget (only when require mode is off)
        runToolPlannerGraphRuntime({
          currentDate: new Date().toISOString().split("T")[0],
          sessionId: String(thread.id),
          userMessage: message,
        })
          .then((result) => {
            for (const event of result.traceEvents) {
              event.threadId = String(thread.id);
              recordBackendTrace(event);
            }
          })
          .catch(() => {
            // Graph runtime failure must NEVER affect the main pipeline.
          });
      }
    } else if (isAgentToolPlannerTraceOnlyEnabled()) {
      runToolPlannerShadowGraph({
        currentDate: new Date().toISOString().split("T")[0],
        sessionId: String(thread.id),
        userMessage: message,
      })
        .then((result) => {
          for (const event of result.traceEvents) {
            event.threadId = String(thread.id);
            recordBackendTrace(event);
          }
        })
        .catch(() => {
          // Shadow planner failure must NEVER affect the main pipeline.
        });
    }

    let lastContextSummary = contextSummary;

    // ── R4D: Early exit with tool planner real PendingAction ──
    let lastResponse: AgentChatResponse | null = null;
    if (toolPlannerRealPending) {
      const rpa = toolPlannerRealPending;
      const assistantMessage = toolPlannerAssistantMessage ?? rpa.proposedAction.summary;
      const nextPendingAction: PendingAction = rpa.pendingAction;

      recordBackendTrace({
        actionId: rpa.proposedAction.id,
        intent: rpa.proposedAction.intent,
        outputPreview: {
          changesCount: rpa.proposedAction.changes.length,
          riskLevel: rpa.proposedAction.riskLevel,
          source: "llm_tool_planner",
          summary: rpa.proposedAction.summary,
        },
        phase: "pending_confirmation",
        status: "success",
        summary: "LLM Tool Planner 已生成待确认动作，确认前不会执行写入。",
        title: "Tool Planner 已创建 pending confirmation",
        toolName: rpa.toolName,
      });

      const updatedThread = await persistAgentTurn({
        assistantMessage,
        confidence: 0.9,
        engine: "workflow",
        intent: rpa.proposedAction.intent,
        nextPendingAction,
      });

      lastResponse = {
        assistantMessage,
        confidence: 0.9,
        engine: "workflow",
        intent: rpa.proposedAction.intent,
        pendingAction: nextPendingAction,
        trace,
        threadId: updatedThread.id,
        tokenUsage,
        backendTraceEvents: undefined,
      };

      logAgentEvent("info", "chat.tool_planner_pending_action", {
        actionId: rpa.proposedAction.id,
        intent: rpa.proposedAction.intent,
        riskLevel: rpa.proposedAction.riskLevel,
        source: "llm_tool_planner",
        threadId: updatedThread.id,
        userId: user.id,
      });
    }

    const confirmationSignals = resolveConfirmationSignals({
      confirmation: structuredConfirmation,
      message,
      pendingAction,
    });

    let currentContext = initialContext;

    // ── R5-A: LLM-required mode — block heuristic business fallback ──
    // When AGENT_REQUIRE_LLM=1, new business requests MUST go through the Tool Planner.
    // If the Tool Planner is unavailable, failed, or produced no valid result,
    // return a controlled response instead of falling through to heuristic paths.
    //
    // EXCEPTION: existing pendingAction confirmation/cancel is still handled
    // deterministically by the EOD loop (resolveIntentStep).
    if (isAgentRequireLLMEnabled() && !lastResponse && !pendingAction) {
      if (!isAgentToolPlannerGraphRuntimeEnabled()) {
        // Tool Planner not enabled in require mode → unavailable
        recordBackendTrace({
          outputPreview: { reason: "tool_planner_disabled" },
          phase: "tool_planner_unavailable",
          status: "failed",
          summary: "LLM require mode active but Tool Planner graph runtime is not enabled.",
          title: "Tool Planner 未启用",
        });
        const plannerResponse = buildToolPlannerUnavailableAgentResponse({
          reason: "tool_planner_disabled",
          threadId: thread.id,
        });
        lastResponse = {
          ...plannerResponse,
          trace,
          tokenUsage,
          backendTraceEvents: undefined,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: plannerResponse.assistantMessage,
          confidence: plannerResponse.confidence,
          engine: "workflow",
          intent: "clarify",
          nextPendingAction: null,
        });
        lastResponse = { ...lastResponse, threadId: updatedThread.id };
      } else if (toolPlannerGraphFailed) {
        // Tool Planner ran but failed → controlled rejection
        const reason = (
          toolPlannerGraphError?.code === "validation_failed" ? "tool_planner_invalid_plan"
          : "tool_planner_failed"
        ) as import("@/lib/agent/tool-planner/unavailable-response").AgentToolPlannerUnavailableReason;
        recordBackendTrace({
          error: { code: toolPlannerGraphError?.code, message: toolPlannerGraphError?.message ?? "Tool Planner graph runtime failed." },
          outputPreview: { reason, graphError: toolPlannerGraphError },
          phase: "tool_planner_unavailable",
          status: "failed",
          summary: `Tool Planner failed: ${toolPlannerGraphError?.code ?? "unknown"}`,
          title: "Tool Planner 执行失败",
        });
        const plannerResponse = buildToolPlannerUnavailableAgentResponse({
          detail: toolPlannerGraphError?.message,
          reason,
          threadId: thread.id,
        });
        lastResponse = {
          ...plannerResponse,
          trace,
          tokenUsage,
          backendTraceEvents: undefined,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: plannerResponse.assistantMessage,
          confidence: plannerResponse.confidence,
          engine: "workflow",
          intent: "clarify",
          nextPendingAction: null,
        });
        lastResponse = { ...lastResponse, threadId: updatedThread.id };

        logAgentEvent("warn", "chat.tool_planner_blocked_heuristic_fallback", {
          graphErrorCode: toolPlannerGraphError?.code ?? "unknown",
          reason,
          threadId: updatedThread.id,
          userId: user.id,
        });
      } else if (toolPlannerAssistantMessage) {
        // R5-B: Read/draft completion — graph succeeded without write proposal
        // Build a controlled response from the graph's assistant message.
        // No pendingAction, no write, no Policy Guard, no execute.
        recordBackendTrace({
          outputPreview: { source: "llm_tool_planner", mode: "read_draft_preview" },
          phase: "tool_planning",
          status: "success",
          summary: "Tool Planner produced read/draft preview.",
          title: "Tool Planner 已生成预览",
        });

        lastResponse = {
          assistantMessage: toolPlannerAssistantMessage,
          confidence: 0.7,
          engine: "workflow",
          intent: "answer_question",
          pendingAction: null,
          trace,
          tokenUsage,
          backendTraceEvents: undefined,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: toolPlannerAssistantMessage,
          confidence: 0.7,
          engine: "workflow",
          intent: "answer_question",
          nextPendingAction: null,
        });
        lastResponse = { ...lastResponse, threadId: updatedThread.id };

        logAgentEvent("info", "chat.tool_planner_read_draft_preview", {
          threadId: updatedThread.id,
          userId: user.id,
          source: "llm_tool_planner",
        });
      }
    }

    // ── EOD Loop (skipped if R4D tool planner already produced a response,
    //              or R5-A gate produced a controlled response) ──
    if (!lastResponse) while (controller.shouldContinue()) {
      controller.advance("orchestrate");

      stream.start({
        id: "stage-orchestration",
        phase: "orchestration",
        title: "编排拆解",
      });
      stream.progress({
        detail: "判断是否需要拆成多个子任务，或保持单轮回答。",
        message: "检查复合意图",
        stageId: "stage-orchestration",
      });
      const orchestrationResult = await timePhase("orchestration", "orchestration", () =>
        runOrchestrationStep({
          autoApproval,
          context: currentContext,
          conversationState,
          emitStatus,
          emitToken,
          message,
          modelCallRecorder,
          payload,
          pendingAction: currentPendingAction,
          persistAgentTurn,
          pushTrace,
          resolvedHistory,
          stream,
          tokenUsage,
          trace,
          user,
        }),
      );
      stream.complete(
        "stage-orchestration",
        orchestrationResult.outcome === "early_exit" ? "编排已生成结果" : "编排检查完成",
      );

      if (orchestrationResult.outcome === "early_exit") {
        lastResponse = orchestrationResult.response;
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        // Track remaining proposal count so the controller has visibility into pending work
        if (lastResponse.pendingAction?.type === "await_batch_confirmation") {
          controller.setRemainingTasks(lastResponse.pendingAction.actions.length);
        }

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;

        tokenUsage = lastResponse.tokenUsage ?? tokenUsage;
        currentPendingAction = lastResponse.pendingAction ?? null;
        continue;
      }

      tokenUsage = orchestrationResult.data.tokenUsage;

      if (orchestrationResult.outcome === "compound") {
        throw new Error(
          "Legacy pipeline received a deferred compound plan unexpectedly.",
        );
      }

      stream.start({
        id: "stage-arbitration",
        phase: "arbitration",
        title: "意图仲裁",
      });
      stream.progress({
        detail: "综合用户输入、pending 状态、模式和编排候选。",
        message: "判断用户真实目标",
        stageId: "stage-arbitration",
      });
      const routerStartMs = Date.now();
      recordBackendTrace({
        inputPreview: {
          hasPendingAction: Boolean(currentPendingAction),
          messageLength: message.length,
          workbenchMode: workbenchMode ?? null,
        },
        phase: "router",
        status: "started",
        title: "开始路由判断",
      });
      let intentResult: Awaited<ReturnType<typeof runResolveIntentStep>>;
      try {
        intentResult = await timePhase("llmRouter", "router", () =>
          runResolveIntentStep({
            confirmationSignals,
            context: currentContext,
            conversationState,
            emitStatus,
            emitToken,
            emitUsage,
            intentModelEngine,
            message,
            modelCallRecorder,
            modelResolver,
            pendingAction: currentPendingAction,
            preResolvedIntent: orchestrationResult.data.preResolvedIntent,
            orchestratorPlanSource: orchestrationResult.data.orchestratorPlanSource,
            persistAgentTurn,
            pushTrace,
            resolvedHistory,
            stream,
            thread,
            tokenUsage,
            trace,
            user,
            userPreferences,
            workbenchMode,
          }),
        );
        recordBackendTrace({
          intent: intentResult.outcome === "early_exit"
            ? intentResult.response.intent
            : intentResult.data.resolution.intent.intent,
          latencyMs: Date.now() - routerStartMs,
          outputPreview: {
            outcome: intentResult.outcome,
          },
          phase: "router",
          status: "success",
          title: "路由判断完成",
        });
      } catch (error) {
        recordBackendTrace({
          error: errorSummaryForTrace(error),
          latencyMs: Date.now() - routerStartMs,
          phase: "router",
          status: "failed",
          title: "路由判断失败",
        });
        throw error;
      }
      stream.complete(
        "stage-arbitration",
        intentResult.outcome === "early_exit" ? "意图仲裁已完成" : "已决定下一步路线",
      );

      if (intentResult.outcome === "early_exit") {
        lastResponse = intentResult.response;
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      const {
        batchExecuteIntents,
        confirmedActionId,
        nextPendingAfterExecute,
        resolution: resolvedResolution,
        tokenUsage: tokenAfterIntent,
      } = intentResult.data;
      let resolution = resolvedResolution;
      tokenUsage = tokenAfterIntent;
      let dryRunConversationState: unknown = undefined;
      const planDraftRevision = evaluatePlanDraftRevision({
        intent: resolution.intent,
        pendingAction: currentPendingAction,
        sessionState: conversationState,
        userMessage: message,
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
        recordBackendTrace({
          intent: resolution.intent.intent,
          outputPreview: {
            status: planDraftRevision.status,
          },
          phase: "draft",
          status: planDraftRevision.status === "revised" ? "success" : "warning",
          title: planDraftRevision.status === "revised" ? "计划草案已更新" : "计划草案不可更新",
        });
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织计划草案修改回复",
        });
        for (const token of splitIntoWordTokens(planDraftRevision.assistantMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "计划草案修改回复已生成");

        const outputTokens = estimateTokenCount(planDraftRevision.assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: planDraftRevision.assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState: planDraftRevision.sessionState,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: planDraftRevision.assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          planningDraft: planDraftRevision.status === "revised"
            ? planDraftRevision.planningDraft
            : null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = null;
        break;
      }

      const checklistDraftGeneration = evaluateChecklistDraftGeneration({
        intent: resolution.intent,
        pendingAction: currentPendingAction,
        sessionState: conversationState,
        userMessage: message,
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
        recordBackendTrace({
          intent: checklistDraftGeneration.intent,
          outputPreview: {
            groupsCount: checklistDraftGeneration.status === "generated"
              ? checklistDraftGeneration.planningChecklistDraft.groups.length
              : 0,
            status: checklistDraftGeneration.status,
          },
          phase: "draft",
          status: checklistDraftGeneration.status === "generated" ? "success" : "warning",
          title: checklistDraftGeneration.status === "generated" ? "清单草案已生成" : "清单草案未生成",
        });
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织清单草案回复",
        });
        for (const token of splitIntoWordTokens(checklistDraftGeneration.assistantMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "清单草案回复已生成");

        const outputTokens = estimateTokenCount(checklistDraftGeneration.assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: checklistDraftGeneration.assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState: checklistDraftGeneration.sessionState,
          engine: resolution.engine,
          intent: checklistDraftGeneration.intent,
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: checklistDraftGeneration.assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: checklistDraftGeneration.intent,
          pendingAction: null,
          planningChecklistDraft: checklistDraftGeneration.status === "generated"
            ? checklistDraftGeneration.planningChecklistDraft
            : null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = null;
        break;
      }

      const checklistCreationPreparation = evaluateChecklistCreationPreparation({
        intent: resolution.intent,
        sessionState: conversationState,
        userMessage: message,
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
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "清单草案提示已生成");

        const outputTokens = estimateTokenCount(checklistCreationPreparation.assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: checklistCreationPreparation.assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState: checklistCreationPreparation.sessionState,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: checklistCreationPreparation.assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          planningChecklistDraft: checklistCreationPreparation.sessionState.planning?.checklistDraft ?? null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      if (checklistCreationPreparation.status === "prepared") {
        pushTrace(checklistCreationPreparation.traceStep);
        resolution = applyChecklistCreationPreparationToResolution(
          resolution,
          checklistCreationPreparation,
        );
        dryRunConversationState = checklistCreationPreparation.sessionState;
      }

      const planCreationPreparation = checklistCreationPreparation.status === "prepared"
        ? { reason: "not_prepare_request" as const, status: "not_prepare" as const }
        : evaluatePlanCreationPreparation({
            intent: resolution.intent,
            sessionState: conversationState,
            userMessage: message,
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
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "计划草案提示已生成");

        const outputTokens = estimateTokenCount(planCreationPreparation.assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: planCreationPreparation.assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState: planCreationPreparation.sessionState,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: planCreationPreparation.assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          planningDraft: planCreationPreparation.sessionState.planning?.draft ?? null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      if (planCreationPreparation.status === "prepared") {
        pushTrace(planCreationPreparation.traceStep);
        resolution = applyPlanCreationPreparationToResolution(
          resolution,
          planCreationPreparation,
        );
        dryRunConversationState = planCreationPreparation.sessionState;
      }

      const scheduleDraftRevision = evaluateScheduleDraftRevision({
        intent: resolution.intent,
        pendingAction: currentPendingAction,
        referenceDate: currentContext.now,
        sessionState: dryRunConversationState ?? conversationState,
        userMessage: message,
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
        recordBackendTrace({
          intent: resolution.intent.intent,
          outputPreview: {
            itemsCount: scheduleDraftRevision.status === "revised"
              ? scheduleDraftRevision.schedulingDraft.items.length
              : 0,
            status: scheduleDraftRevision.status,
          },
          phase: "draft",
          status: scheduleDraftRevision.status === "revised" ? "success" : "warning",
          title: scheduleDraftRevision.status === "revised" ? "日程草案已更新" : "日程草案需要澄清",
        });
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织日程草案修改回复",
        });
        for (const token of splitIntoWordTokens(scheduleDraftRevision.assistantMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "日程草案修改回复已生成");

        const outputTokens = estimateTokenCount(scheduleDraftRevision.assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: scheduleDraftRevision.assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState: scheduleDraftRevision.sessionState,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: scheduleDraftRevision.assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          schedulingDraft: scheduleDraftRevision.status === "revised"
            ? scheduleDraftRevision.schedulingDraft
            : null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = null;
        break;
      }

      const scheduleCreationPreparation = evaluateScheduleCreationPreparation({
        intent: resolution.intent,
        sessionState: dryRunConversationState ?? conversationState,
        userMessage: message,
      });
      const effectiveScheduleCreationPreparation = checklistCreationPreparation.status === "prepared" ||
        planCreationPreparation.status === "prepared"
        ? { reason: "not_prepare_request" as const, status: "not_prepare" as const }
        : scheduleCreationPreparation;

      if (
        effectiveScheduleCreationPreparation.status === "missing_draft" ||
        effectiveScheduleCreationPreparation.status === "invalid_draft"
      ) {
        emitStatus("当前没有可创建的日程草案，需要先生成草案...");
        pushTrace(effectiveScheduleCreationPreparation.traceStep);
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织日程草案提示",
        });
        for (const token of splitIntoWordTokens(effectiveScheduleCreationPreparation.assistantMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "日程草案提示已生成");

        const outputTokens = estimateTokenCount(effectiveScheduleCreationPreparation.assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: effectiveScheduleCreationPreparation.assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState: effectiveScheduleCreationPreparation.sessionState,
          engine: resolution.engine,
          intent: "clarify",
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: effectiveScheduleCreationPreparation.assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "clarify",
          pendingAction: null,
          schedulingDraft: effectiveScheduleCreationPreparation.sessionState.scheduling?.draft ?? null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      if (effectiveScheduleCreationPreparation.status === "prepared") {
        pushTrace(effectiveScheduleCreationPreparation.traceStep);
        resolution = applyScheduleCreationPreparationToResolution(
          resolution,
          effectiveScheduleCreationPreparation,
        );
        dryRunConversationState = effectiveScheduleCreationPreparation.sessionState;
      }

      /* ── Second-Pass Context Loading (only when policy is ON, not shadow) ── */
      if (policyOn && contextLoadingMeta.allowSecondPass) {
        const requiredSections = getRequiredSectionsForIntent(resolution.intent.intent);
        const loadedSet = new Set(contextLoadingMeta.loadedSections);
        const missing = getMissingSectionsForSecondPass(requiredSections, loadedSet);

        if (missing.length > 0) {
          stream.progress({
            detail: `Router intent=${resolution.intent.intent} 需要 sections=[${[...requiredSections].join(",")}]，当前缺失 [${missing.join(",")}]，触发 second pass`,
            message: "补载缺失上下文",
            stageId: "stage-context",
          });

          const mergedSections = mergeSectionsForSecondPass(
            loadedSet,
            missing,
          );

          contextStep = await timePhase("contextBuilder", "context", () =>
            runBuildContextStep({
              baseTokenUsage,
              contextPreferences: contextPreferences ?? undefined,
              emitStatus,
              emitToken,
              emitUsage,
              loadingSections: mergedSections,
              dateRange: contextLoadingMeta.dateRange,
              targetDocument: contextLoadingMeta.targetDocument,
              message,
              payload,
              pendingAction: currentPendingAction,
              pushTrace,
              stream,
              streamStageId: "stage-context-2nd",
              threadSummary,
              workbenchMode,
            }),
          );

          /* Update context and meta */
          currentContext = contextStep.context;
          currentContextMemories = contextStep.context.memories ?? [];
          tokenUsage = { ...tokenUsage, contextTokens: contextStep.tokenUsage.contextTokens };
          controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);
          lastContextSummary = contextStep.contextSummary;

          contextLoadingMeta.secondPassTriggered = true;
          contextLoadingMeta.secondPassAddedSections = missing;
          contextLoadingMeta.loadedSections = [...mergedSections];
          contextLoadingMeta.skippedSections = contextLoadingMeta.sections.filter(
            (s) => !mergedSections.has(s),
          );
        }
      }

      const scheduleBoundary = classifyScheduleIntentBoundary({
        hasPendingAction: Boolean(currentPendingAction),
        hasSchedulingDraft: Boolean(
          (conversationState as { scheduling?: { draft?: unknown } } | null | undefined)?.scheduling?.draft,
        ),
        routerIntent: resolution.intent.intent,
        userMessage: message,
      });

      if (
        scheduleBoundary.intent === "query_schedule" &&
        !confirmedActionId &&
        (!batchExecuteIntents || batchExecuteIntents.length === 0)
      ) {
        emitStatus("正在整理最近日程摘要...");
        pushTrace({
          detail: JSON.stringify({
            boundaryConfidence: scheduleBoundary.confidence,
            boundaryReason: scheduleBoundary.reason,
            boundarySource: scheduleBoundary.source,
            gateApplied: true,
            intent: "query_schedule",
            itemsCount: currentContext.schedules?.length ?? 0,
            routerIntent: resolution.intent.intent,
            writePath: false,
          }),
          id: "schedule-query-readonly",
          kind: "analysis",
          status: "done",
          title: "日程查询只读返回",
        });
        recordBackendTrace({
          apiPath: "schedule-items",
          intent: "query_schedule",
          outputPreview: {
            itemsCount: currentContext.schedules?.length ?? 0,
            rangeLabel: inferScheduleQueryRangeLabel(message),
            writePath: false,
          },
          phase: "api_call",
          status: "success",
          summary: "只读取本地 schedule-items，不进入写入链路。",
          title: "读取本地日程",
          toolName: "query_schedule",
        });
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织日程摘要",
        });
        const assistantMessage = formatScheduleQueryAssistantMessage({
          rangeLabel: inferScheduleQueryRangeLabel(message),
          schedules: currentContext.schedules ?? [],
        });
        for (const token of splitIntoWordTokens(assistantMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "日程摘要已生成");

        const outputTokens = estimateTokenCount(assistantMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage,
          confidence: resolution.intent.confidence,
          conversationState,
          engine: resolution.engine,
          intent: "query_schedule",
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage,
          confidence: resolution.intent.confidence,
          engine: resolution.engine,
          intent: "query_schedule",
          pendingAction: null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      const routerOutput =
        resolution.routerOutput ??
        normalizeRouterOutput({ arbitration: resolution.arbitration, intent: resolution.intent });
      const planReadinessGate = planCreationPreparation.status === "prepared"
        ? { gateApplied: false as const, reason: "ready_enough" as const }
        : evaluatePlanReadinessGate({
            batchExecuteIntentCount: batchExecuteIntents?.length ?? 0,
            confirmedActionId,
            intent: resolution.intent,
            sessionState: conversationState,
            sessionSlots: extractPlanSlotsFromSessionState(conversationState),
            userMessage: message,
          });
      if (resolution.intent.intent === "compose_plan" || resolution.intent.intent === "create_plan") {
        recordBackendTrace({
          intent: resolution.intent.intent,
          outputPreview: {
            gateApplied: planReadinessGate.gateApplied,
            reason: planReadinessGate.gateApplied
              ? planReadinessGate.readiness.reason
              : planReadinessGate.reason,
            ...(planReadinessGate.gateApplied
              ? {
                  knownSlots: planReadinessGate.readiness.knownSlots,
                  missingSlots: planReadinessGate.readiness.missingSlots,
                  readinessStatus: planReadinessGate.readiness.status,
                }
              : {}),
          },
          phase: "readiness",
          status: planReadinessGate.gateApplied ? "warning" : "success",
          title: planReadinessGate.gateApplied ? "计划上下文不足" : "计划上下文已通过",
        });
      }

      if (planReadinessGate.gateApplied) {
        emitStatus("计划上下文不足，需要先澄清关键问题...");
        pushTrace(planReadinessGate.traceStep);
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织计划澄清回复",
        });

        const planClarificationMessage = await composePlanClarificationAsync({
          deadline: planReadinessGate.readiness.knownSlots.includes("deadline") ? undefined : undefined,
          fallbackMessage: planReadinessGate.assistantMessage,
          goal: undefined,
          hasPlanningDraft: Boolean(planReadinessGate.planningDraft),
          missingSlotKeys: planReadinessGate.readiness.missingSlots,
          userMessage: message,
        });

        for (const token of splitIntoWordTokens(planClarificationMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "计划澄清回复已生成");

        const outputTokens = estimateTokenCount(planClarificationMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: planClarificationMessage,
          confidence: planReadinessGate.readiness.confidence,
          conversationState: planReadinessGate.sessionState,
          engine: resolution.engine,
          intent: planReadinessGate.intent,
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: planClarificationMessage,
          confidence: planReadinessGate.readiness.confidence,
          engine: resolution.engine,
          intent: planReadinessGate.intent,
          pendingAction: null,
          planningDraft: planReadinessGate.planningDraft ?? null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      /* ──── LLM Slot Extraction (schedule_creation path only, before readiness gate) ──── */
      const isScheduleCreationPath =
        resolution.intent.intent === "create_schedule_items" ||
        resolution.intent.intent === "compose_schedule_item" ||
        resolution.intent.intent === "schedule_plan";
      const llmSlotResult = isScheduleCreationPath
        ? await extractSlotsWithLLM({
            currentDate: new Date().toISOString().split("T")[0],
            userMessage: message,
          })
        : null;
      const llmEnhancedSlots = llmSlotResult
        ? mergeLLMSlots({}, llmSlotResult).slots
        : undefined;
      if (llmSlotResult && llmSlotResult.source === "llm") {
        recordBackendTrace({
          inputPreview: { source: llmSlotResult.source, candidateCount: llmSlotResult.candidates.length },
          phase: "slot_extraction",
          status: "success",
          summary: `LLM 提取了 ${llmSlotResult.candidates.length} 个 slot candidate`,
          title: "LLM 辅助提取日程 slots",
        });
      }

      const scheduleReadinessGate = effectiveScheduleCreationPreparation.status === "prepared"
        ? { gateApplied: false as const, reason: "ready_without_gate" as const }
        : evaluateScheduleReadinessGate({
            batchExecuteIntentCount: batchExecuteIntents?.length ?? 0,
            confirmedActionId,
            intent: resolution.intent,
            llmSlots: llmEnhancedSlots,
            sessionState: conversationState,
            userMessage: message,
          });
      if (
        resolution.intent.intent === "create_schedule_items" ||
        resolution.intent.intent === "compose_schedule_item" ||
        resolution.intent.intent === "schedule_plan"
      ) {
        recordBackendTrace({
          intent: resolution.intent.intent,
          outputPreview: {
            gateApplied: scheduleReadinessGate.gateApplied,
            reason: scheduleReadinessGate.gateApplied
              ? scheduleReadinessGate.readiness.reason
              : scheduleReadinessGate.reason,
            ...(scheduleReadinessGate.gateApplied
              ? {
                  knownSlots: scheduleReadinessGate.readiness.knownSlots,
                  missingSlots: scheduleReadinessGate.readiness.missingSlots,
                  readinessStatus: scheduleReadinessGate.readiness.status,
                }
              : {}),
          },
          phase: "readiness",
          status: scheduleReadinessGate.gateApplied ? "warning" : "success",
          title: scheduleReadinessGate.gateApplied ? "日程上下文不足" : "日程上下文已通过",
        });
      }

      if (scheduleReadinessGate.gateApplied) {
        emitStatus("日程上下文需要先补齐...");
        pushTrace(scheduleReadinessGate.traceStep);
        stream.start({
          id: "stage-response",
          phase: "response",
          title: "组织日程澄清回复",
        });

        const scheduleClarificationMessage = await composeScheduleClarificationAsync({
          fallbackMessage: scheduleReadinessGate.assistantMessage,
          hasSchedulingDraft: Boolean(scheduleReadinessGate.scheduleDraft),
          missingSlotKeys: scheduleReadinessGate.readiness.missingSlots,
          sourceLabel: scheduleReadinessGate.scheduleDraft
            ? humanSourceLabel(scheduleReadinessGate.scheduleDraft.sourceType)
            : null,
          userMessage: message,
        });

        for (const token of splitIntoWordTokens(scheduleClarificationMessage)) {
          emitToken(token, "response");
          await new Promise((resolve) => setTimeout(resolve, 6));
        }
        stream.complete("stage-response", "日程澄清回复已生成");

        const outputTokens = estimateTokenCount(scheduleClarificationMessage);
        tokenUsage = {
          ...tokenUsage,
          outputTokens,
          totalTokens: tokenUsage.contextTokens + tokenUsage.inputTokens + outputTokens,
        };
        const updatedThread = await persistAgentTurn({
          assistantMessage: scheduleClarificationMessage,
          confidence: scheduleReadinessGate.readiness.confidence,
          conversationState: scheduleReadinessGate.sessionState,
          engine: resolution.engine,
          intent: scheduleReadinessGate.intent,
          nextPendingAction: null,
        });

        lastResponse = attachMeta({
          assistantMessage: scheduleClarificationMessage,
          confidence: scheduleReadinessGate.readiness.confidence,
          engine: resolution.engine,
          intent: scheduleReadinessGate.intent,
          pendingAction: null,
          planningDraft: null,
          schedulingDraft: scheduleReadinessGate.scheduleDraft ?? null,
          threadId: updatedThread.id,
          tokenUsage,
          trace,
        });
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        break;
      }

      const llmRouterOutput = resolution.llmRouterOutput ?? agentRouterToLLMRouter(routerOutput);
      const capabilityGate = getAllowedCapabilities({
        intent: resolution.intent,
        router: routerOutput,
        userContext: { preferences: userPreferences, userId: user.id },
      });
      const toolPlan = buildToolPlan({
        allowedCapabilities: capabilityGate.allowed,
        router: llmRouterOutput,
      });
      resolution.toolPlan = toolPlan;
      Object.assign(turnAudit, recordCapabilityGateTrace(turnAudit, capabilityGate));
      Object.assign(
        turnAudit,
        recordRouterTrace(turnAudit, routerOutput, { llmRouterOutput, toolPlan }),
      );
      Object.assign(
        turnAudit,
        recordPolicyTrace(
          turnAudit,
          evaluatePolicyGuard(routerOutput, {
            userContext: { preferences: userPreferences, userId: user.id },
          }),
        ),
      );
      Object.assign(turnAudit, recordPolicyGuardOutputTrace(turnAudit, applyPolicyGuard({ router: routerOutput })));
      Object.assign(turnAudit, recordToolPlanTrace(turnAudit, toolPlan));
      dispatchWorkflow({ confirmed: Boolean(confirmedActionId), router: llmRouterOutput, toolPlan });

      if (batchExecuteIntents && batchExecuteIntents.length > 0) {
        stream.start({
          id: "stage-execution",
          phase: "execution",
          title: "执行写入",
        });
        stream.progress({
          detail: `准备执行 ${batchExecuteIntents.length} 项已确认动作。`,
          message: "批量执行队列",
          stageId: "stage-execution",
        });
        lastResponse = attachMeta(
          await timePhase("toolExecution", "execution", () =>
            runExecuteAndPersistStep({
              batchExecuteIntents,
              confirmedActionId,
              emitStatus,
              emitToken,
              isDirectAnswer: false,
              persistAgentTurn,
              pushTrace,
              recordBackendTrace,
              resolution,
              stream,
              tokenUsage,
              trace,
              user,
            }),
          ),
        );
        stream.complete("stage-execution", "执行完成");
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = lastResponse.pendingAction ?? null;

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;
        continue;
      }

      try {
        const isWriteLike = resolution.intent.intent !== "answer_question" && resolution.intent.intent !== "clarify";

        if (isWriteLike || confirmedActionId) {
          stream.start({
            id: "stage-dry-run",
            phase: "dry_run",
            title: "写入预检",
          });
          stream.progress({
            detail: "先生成变更预览和风险等级，确认后才会写入。",
            message: "运行 DryRun 安全门",
            stageId: "stage-dry-run",
          });
        }
        const dryResult = await runDryRunAndProposeStep({
          autoApproval,
          confirmedActionId,
          context: currentContext,
          emitStatus,
          emitToken,
          payload,
          persistAgentTurn,
          pushTrace,
          recordBackendTrace,
          resolution,
          stream,
          conversationState: dryRunConversationState,
          tokenUsage,
          trace,
          turnAudit,
          user,
          userPreferences,
        });
        if (isWriteLike || confirmedActionId) {
          stream.complete(
            "stage-dry-run",
            dryResult.outcome === "early_exit" ? "预检已生成确认信息" : "预检通过",
          );
        }

        if (dryResult.outcome === "early_exit") {
          lastResponse = dryResult.response;
          controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
          break;
        }

        const {
          conversationState: executeConversationState,
          executionApproved,
          isDirectAnswer,
          tokenUsage: tokenAfterDry,
        } = dryResult.data;
        tokenUsage = tokenAfterDry;

        if (!isDirectAnswer || confirmedActionId) {
          stream.start({
            id: isDirectAnswer ? "stage-response" : "stage-execution",
            phase: isDirectAnswer ? "response" : "execution",
            title: isDirectAnswer ? "组织回复" : "执行动作",
          });
          stream.progress({
            detail: isDirectAnswer ? "根据仲裁结果生成最终回答。" : "执行已确认或低风险动作。",
            message: isDirectAnswer ? "生成答案" : "写入或同步数据",
            stageId: isDirectAnswer ? "stage-response" : "stage-execution",
          });
        }
        let executedCapabilityName: string | null = null;
        const execResult = await timePhase("toolExecution", "execution", () =>
          runExecuteAndPersistStep({
            confirmedActionId,
            conversationState: executeConversationState ?? dryRunConversationState ?? conversationState,
            emitStatus,
            emitToken,
            executionApproved,
            executedCapability: (name) => {
              executedCapabilityName = name;
            },
            isDirectAnswer,
            nextPendingAfterExecute,
            pendingAction: currentPendingAction,
            persistAgentTurn,
            pushTrace,
            recordBackendTrace,
            resolution,
            stream,
            structuredConfirmation,
            tokenUsage,
            trace,
            user,
          }),
        );
        if (!isDirectAnswer && (executionApproved || confirmedActionId)) {
          const actualName =
            executedCapabilityName ??
            capabilityNameForIntent(resolution.intent.intent as AgentWriteIntentName, "execute");
          Object.assign(turnAudit, recordActualTool(turnAudit, actualName));
        }
        turnAudit.confirmationState = pendingActionToConfirmationState(
          execResult.pendingAction,
          executionApproved || Boolean(confirmedActionId),
        );
        const consistency = assertPlannedVsActual(turnAudit);
        pushTrace({
          detail: consistency.reason,
          id: "tool-plan-consistency",
          kind: consistency.ok ? "complete" : "error",
          status: consistency.ok ? "done" : "error",
          title: consistency.ok ? "工具计划一致" : "工具计划不一致",
        });
        if (!isDirectAnswer || confirmedActionId) {
          stream.complete(isDirectAnswer ? "stage-response" : "stage-execution", isDirectAnswer ? "回复已完成" : "执行完成");
        }

        lastResponse = attachMeta(execResult);
        controller.setLastResponse(lastResponse.assistantMessage, lastResponse.pendingAction);
        currentPendingAction = lastResponse.pendingAction ?? null;

        // Refresh context for next iteration if the loop continues
        if (lastResponse.pendingAction === null) {
          stream.start({
            id: "stage-context-refresh",
            phase: "context",
            title: "刷新上下文",
          });
          /* Re-resolve policy: after first iteration we may have a new pendingAction or lastIntent */
          const refreshPolicy = resolveContextLoadingPolicy({
            workbenchMode,
            message,
            pendingAction: currentPendingAction,
            lastIntent: (lastResponse as { intent?: string } | null)?.intent ?? thread.lastIntent as string | null,
          });
          const refreshSections = policyOn ? refreshPolicy.sections : null;
          contextStep = await runBuildContextStep({
            baseTokenUsage,
            contextPreferences: contextPreferences ?? undefined,
            emitStatus,
            emitToken,
            emitUsage,
            loadingSections: refreshSections,
            dateRange: refreshPolicy.meta.dateRange,
            targetDocument: refreshPolicy.meta.targetDocument,
            message,
            payload,
            pendingAction: currentPendingAction,
            pushTrace,
            stream,
            streamStageId: "stage-context-refresh",
            threadSummary,
            workbenchMode,
          });
          /* Update meta for second-pass on next iteration */
          contextLoadingMeta = {
            ...refreshPolicy.meta,
            loadedSections: refreshSections ? [...refreshSections] : [],
            skippedSections: refreshSections
              ? refreshPolicy.meta.sections.filter((s) => !refreshSections.has(s))
              : [],
          };
          currentContext = contextStep.context;
          currentContextMemories = currentContext.memories ?? [];
          tokenUsage = { ...tokenUsage, contextTokens: contextStep.tokenUsage.contextTokens };
          controller.budget.consumeContext(contextStep.tokenUsage.contextTokens);
          lastContextSummary = contextStep.contextSummary;
          stream.complete("stage-context-refresh", "上下文已刷新");
        }

        const nextPhase = controller.observe();
        if (nextPhase === "done") break;
      } catch (error) {
        recordBackendTrace({
          error: errorSummaryForTrace(error),
          intent: resolution.intent.intent,
          phase: "error",
          status: "failed",
          title: "Agent 动作执行失败",
        });
        logAgentEvent("error", "chat.pipeline_error", {
          error: error instanceof Error ? error.message : String(error),
          intent: resolution.intent.intent,
          threadId: thread.id,
        });
        await recordAgentFailure({
          error,
          intent: resolution.intent.intent,
          message,
          userId: user.id,
        });
        logAgentEvent("error", "chat.intent_failed", {
          error: error instanceof Error ? error.message : "Unknown Agent failure",
          intent: resolution.intent.intent,
          threadId: thread.id,
          userId: user.id,
        });
        pushTrace({
          detail: error instanceof Error ? error.message : "Unknown Agent failure",
          id: "action-error",
          kind: "error",
          status: "error",
          title: "动作执行失败",
        });
        throw error;
      }
    }

    // Fallback: if no response was generated, produce one
    if (!lastResponse) {
      const progressSummary = controller.buildProgressSummary();
      lastResponse = {
        assistantMessage: `Agent 执行已完成（${progressSummary}）。`,
        confidence: 0.5,
        engine: "workflow",
        intent: "answer_question",
        pendingAction: null,
        threadId: thread.id,
        tokenUsage,
      };
    }

    if (lastContextSummary && !lastResponse.contextSummary) {
      lastResponse = { ...lastResponse, contextSummary: lastContextSummary };
    }
    recordBackendTrace({
      intent: lastResponse.intent,
      outputPreview: {
        hasPendingAction: Boolean(lastResponse.pendingAction),
        pendingActionType: lastResponse.pendingAction?.type ?? null,
      },
      phase: "finalize",
      status: "success",
      title: "Agent 响应已完成",
    });
    lastResponse = attachMeta(lastResponse);

    if (finalizeTurn) {
      const turn = bufferedTurn as {
        assistantMessage: string;
        confidence?: number;
        conversationState?: unknown;
        engine: AgentEngine;
        intent: AgentIntent["intent"];
        nextPendingAction: null | PendingAction;
      } | null;
      const response = attachMeta(turn
        ? {
            ...lastResponse,
            assistantMessage: turn.assistantMessage,
            confidence: turn.confidence ?? lastResponse.confidence,
            engine: turn.engine,
            intent: turn.intent,
            pendingAction: turn.nextPendingAction,
          }
        : lastResponse);

      return finalizeTurn({
        existingMemories: currentContextMemories,
        conversationStateOverride: turn?.conversationState,
        pushTrace,
        response,
        tokenUsage: response.tokenUsage ?? tokenUsage,
      });
    }

    return attachMeta(lastResponse);
  };
};
