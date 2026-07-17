/**
 * Resolve Intent Step — Facade / Orchestrator.
 *
 * R6-C0-C-Fix: Delegates to:
 *  1. confirmation-resolution-step.ts — pendingAction confirm/cancel (safety)
 *  2. legacy-heuristic-resolution-step.ts — heuristic intent resolution (legacy)
 *
 * AGENT_REQUIRE_LLM=1 new user goals are gated by R5-A before reaching this function.
 * This function is only called when:
 *  - pendingAction exists (confirmation handling), OR
 *  - AGENT_REQUIRE_LLM=0 legacy mode is active
 */

import { recordAgentConfirmationDecision, recordBatchConfirmationDecision } from "@/lib/agent/audit";
import type { BuildContextStepResult } from "@/lib/agent/chat-pipeline/build-context-step";
import type { ConfirmationSignals } from "@/lib/agent/chat-pipeline/confirmation-step";
import type { AgentModelIntentResolver } from "@/lib/agent/intent-resolution";
import type { AgentArbitrationDecision } from "@/lib/agent/intent/arbitration";
import type { LLMRouterOutput } from "../router/llm-router-schema";
import type { ToolPlan } from "../plan/tool-plan";
import type { AgentRouterOutput } from "@/lib/agent/router/types";
import type {
  AgentChatMessage,
  AgentChatResponse,
  AgentEngine,
  AgentIntent,
  AgentTraceStep,
  PendingAction,
} from "@/lib/agent/schemas";
import type { AgentThread } from "@/payload-types";
import type { AgentStreamController } from "@/lib/agent/stream-events";
import type { AgentWorkbenchMode } from "@/lib/agent/workbench-mode";
import type { WritingAssistRequest } from "@/lib/agent/writing-assist-core";
import type { WritingAssistResult } from "@/lib/agent/prompts/writing-assist";
import type {
  StreamTokenCallback,
} from "@/lib/agent/client";
import type { OrchestratorPlanSource } from "@/lib/agent/orchestration/plan-source";
import { resolveConfirmationStep } from "./confirmation-resolution-step";
import { resolveLegacyHeuristicStep } from "./legacy-heuristic-resolution-step";
import type { runConversationalAnswer } from "@/lib/agent/answer/runtime";
import type { ModelCallBudgetRecorder } from "@/lib/agent/orchestration/model-call-budget";

/* ──── Types ──── */

export type IntentResolution = {
  arbitration?: AgentArbitrationDecision;
  engine: AgentEngine;
  intent: AgentIntent;
  llmRouterOutput?: LLMRouterOutput;
  routerOutput?: AgentRouterOutput;
  toolPlan?: ToolPlan;
  tokenUsage?: AgentChatResponse["tokenUsage"];
};

export type ResolveIntentStepParams = {
  confirmationSignals: ConfirmationSignals;
  context: BuildContextStepResult["context"];
  conversationState?: import("@/lib/agent/conversation/types").AgentConversationState | null;
  conversationalAnswerRunner?: typeof runConversationalAnswer;
  emitStatus: (status: string) => void;
  emitToken: StreamTokenCallback;
  emitUsage: (tokenUsage: AgentChatResponse["tokenUsage"]) => void;
  intentModelEngine: AgentEngine;
  message: string;
  modelCallRecorder?: ModelCallBudgetRecorder;
  modelResolver: AgentModelIntentResolver;
  orchestratorPlanSource?: null | OrchestratorPlanSource;
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
  stream?: AgentStreamController;
  thread: AgentThread;
  tokenUsage: NonNullable<AgentChatResponse["tokenUsage"]>;
  trace: AgentTraceStep[];
  user: { collection?: "users"; id: number };
  userPreferences?: import("@/lib/agent/user-preferences").UserPreferences | null;
  workbenchMode?: AgentWorkbenchMode | null;
  writingAssistRunner?: (request: WritingAssistRequest) => Promise<WritingAssistResult>;
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

/* ──── Main ──── */

/**
 * R6-C0-C-Fix: Delegates to:
 *  1. confirmation-resolution-step.ts — pendingAction confirm/cancel (safety)
 *  2. legacy-heuristic-resolution-step.ts — heuristic intent resolution (legacy)
 *
 * AGENT_REQUIRE_LLM=1 new user goals are gated by R5-A before reaching this function.
 */
export const runResolveIntentStep = async (params: ResolveIntentStepParams): Promise<ResolveIntentStepResult> => {
  const {
    confirmationSignals,
    conversationalAnswerRunner,
    context,
    conversationState = null,
    emitStatus,
    emitToken,
    emitUsage,
    intentModelEngine,
    message,
    modelCallRecorder,
    modelResolver,
    orchestratorPlanSource,
    pendingAction,
    preResolvedIntent,
    recordAgentConfirmationDecisionFn = recordAgentConfirmationDecision,
    recordBatchConfirmationDecisionFn = recordBatchConfirmationDecision,
    persistAgentTurn,
    pushTrace,
    resolvedHistory,
    stream,
    thread: _thread,
    tokenUsage: tokenUsageIn,
    trace,
    user,
    userPreferences,
    workbenchMode,
    writingAssistRunner,
  } = params;

  // R6-C0-C-Fix: Delegate confirmation handling to extracted module
  const confirmResult = await resolveConfirmationStep({
    confirmationSignals,
    emitStatus,
    message,
    pendingAction,
    persistAgentTurn,
    pushTrace,
    recordAgentConfirmationDecisionFn,
    recordBatchConfirmationDecisionFn,
    tokenUsage: tokenUsageIn,
    trace,
    user,
  });

  if (confirmResult.outcome !== "no_pending_action") {
    return confirmResult;
  }

  // R6-C0-C-Fix: Delegate legacy heuristic resolution to extracted module
  return resolveLegacyHeuristicStep({
    confirmationSignals,
    context,
    conversationalAnswerRunner,
    conversationState,
    emitStatus,
    emitToken,
    emitUsage,
    intentModelEngine,
    message,
    modelCallRecorder,
    modelResolver,
    orchestratorPlanSource,
    pendingAction,
    preResolvedIntent,
    persistAgentTurn,
    pushTrace,
    resolvedHistory,
    stream,
    tokenUsage: tokenUsageIn,
    trace,
    user,
    userPreferences,
    workbenchMode,
    writingAssistRunner,
  });
};
