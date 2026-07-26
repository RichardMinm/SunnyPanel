/**
 * Bounded model-role adapters for the production-seam L3-B gate.
 *
 * The adapters preserve only typed protocol state, counters, token estimates,
 * and latency. Provider text, answer text, prompts, workspace values, and
 * thrown errors never enter their evidence snapshots.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

import {
  runConversationalAnswer,
  type RunConversationalAnswerInput,
} from "../answer/runtime";
import type {
  ConversationalAnswerTerminalState,
  SafeAnswerErrorCode,
} from "../answer/types";
import type {
  StructuredAttemptFailureReason,
  StructuredProviderAttemptEvent,
  StructuredProviderAttemptObserver,
} from "../llm/invoke-structured";
import type { ModelConfig } from "../llm/model-config";
import type { ModelFactory } from "../llm/model-factory";
import type { SafeProtocolDiagnostics } from "../llm/structured-protocol";
import type { AgentPromptContext } from "../prompts";
import type { AgentIntent } from "../schemas";
import { estimateTokenCount } from "../token-usage";
import {
  projectOrchestratorFailureToSafePlan,
  runLangChainOrchestratorResult,
  type OrchestratorDecisionProjection,
  type OrchestratorFailureReason,
} from "./langchain-orchestrator";
import type { ModelCallBudgetRecorder } from "./model-call-budget";
import type { runOrchestrator } from "./orchestrator";
import type { DecisionConsistencyErrorCode } from "./orchestrator-decision-consistency";
import type { QueryScopeErrorCode } from "./query-scope-contract";
import type {
  ResidualPlannerFailureCode,
  ResidualRejectionReason,
} from "./residual-langchain-planner";
import type { ResourceReadinessErrorCode } from "./resource-readiness-guard";
import type {
  SchedulePlanReferenceCorrectionCode,
  SchedulePlanReferenceErrorCode,
} from "./schedule-plan-reference-contract";

export type SanitizedRoleEvent = Readonly<{
  answerStatus?: "complete" | "incomplete" | "unavailable";
  attempt: number | null;
  failureCode?: OrchestratorFailureReason | SafeAnswerErrorCode;
  failureReason?: StructuredAttemptFailureReason;
  inputTokens: number | null;
  latencyMs: number | null;
  outputTokens: number | null;
  passed?: boolean;
  phase: StructuredProviderAttemptEvent["phase"] | "terminal";
  protocolFailure?: string;
  retryScheduled?: boolean;
  role: "answer_renderer" | "full_orchestrator" | "residual_planner";
  safeProtocol?: SafeProtocolDiagnostics;
  schemaIssues?: readonly Readonly<{
    code: string;
    missing: boolean;
    path: readonly (number | string)[];
  }>[];
  status?: "clarified" | "success" | "unavailable";
  totalTokens: number | null;
}>;

export type ProductionFullRoleEvidence = Readonly<{
  completedResponses: number;
  clarificationSource:
    | "query_scope"
    | "resource_readiness"
    | "schedule_plan_reference"
    | null;
  decisionConsistencyError: DecisionConsistencyErrorCode | null;
  failureCode: OrchestratorFailureReason | null;
  inputTokens: number | null;
  latencyMs: number | null;
  outputTokens: number | null;
  providerAttempts: number;
  providerLatenciesMs: readonly number[];
  queryScopeErrorCode: QueryScopeErrorCode | null;
  resourceIssueCodes: readonly ResourceReadinessErrorCode[];
  schedulePlanReferenceCorrectionCode:
    SchedulePlanReferenceCorrectionCode | null;
  schedulePlanReferenceErrorCode: SchedulePlanReferenceErrorCode | null;
  semanticProjection: OrchestratorDecisionProjection | null;
  semanticValidationPasses: number;
  semanticValidationsCompleted: number;
  status: "clarified" | "not_called" | "success" | "unavailable";
  strictSchemaPasses: number;
  timeoutAttempts: number;
  totalTokens: number | null;
  transportFailures: number;
}>;

export type ProductionAnswerRoleEvidence = Readonly<{
  failureCode: SafeAnswerErrorCode | null;
  inputTokens: number;
  latencyMs: number | null;
  logicalCalls: number;
  outputTokens: number;
  providerAttempts: number;
  status: "complete" | "incomplete" | "not_called" | "unavailable";
  totalTokens: number;
}>;

export type ProductionResidualRoleEvidence = Readonly<{
  completedResponses: number;
  failureCode: ResidualPlannerFailureCode | null;
  inputTokens: null;
  latencyMs: number | null;
  outputTokens: null;
  providerAttempts: number;
  providerLatenciesMs: readonly number[];
  rejectionReason: ResidualRejectionReason | null;
  semanticValidationPasses: number;
  semanticValidationsCompleted: number;
  status: "not_called" | "success" | "unavailable";
  strictSchemaPasses: number;
  timeoutAttempts: number;
  totalTokens: null;
  transportFailures: number;
}>;

export type ProductionRoleEvidence = Readonly<{
  answerRenderer: ProductionAnswerRoleEvidence;
  fullOrchestrator: ProductionFullRoleEvidence;
  queryCommentary: "omitted";
  residualPlanner: ProductionResidualRoleEvidence;
}>;

const observeSafely = (
  observe: (event: SanitizedRoleEvent) => void,
  event: SanitizedRoleEvent,
): void => {
  try {
    observe(event);
  } catch {
    // Evaluation observers must never change model behavior.
  }
};

const emptyFullEvidence = (): ProductionFullRoleEvidence => Object.freeze({
  completedResponses: 0,
  clarificationSource: null,
  decisionConsistencyError: null,
  failureCode: null,
  inputTokens: null,
  latencyMs: null,
  outputTokens: null,
  providerAttempts: 0,
  providerLatenciesMs: Object.freeze([]),
  queryScopeErrorCode: null,
  resourceIssueCodes: Object.freeze([]),
  schedulePlanReferenceCorrectionCode: null,
  schedulePlanReferenceErrorCode: null,
  semanticProjection: null,
  semanticValidationPasses: 0,
  semanticValidationsCompleted: 0,
  status: "not_called",
  strictSchemaPasses: 0,
  timeoutAttempts: 0,
  totalTokens: null,
  transportFailures: 0,
});

export const emptyProductionAnswerEvidence =
  (): ProductionAnswerRoleEvidence => Object.freeze({
    failureCode: null,
    inputTokens: 0,
    latencyMs: null,
    logicalCalls: 0,
    outputTokens: 0,
    providerAttempts: 0,
    status: "not_called",
    totalTokens: 0,
  });

const sanitizeSchemaIssues = (
  event: Extract<StructuredProviderAttemptEvent, { phase: "failed" }>,
) => event.schemaIssues
  ? Object.freeze(event.schemaIssues.map((issue) => Object.freeze({
      code: issue.code,
      missing: issue.missing,
      path: Object.freeze([...issue.path]),
    })))
  : undefined;

export const sanitizeStructuredAttempt = (
  event: StructuredProviderAttemptEvent,
  role: Extract<SanitizedRoleEvent["role"], "full_orchestrator" | "residual_planner"> =
    "full_orchestrator",
): SanitizedRoleEvent => Object.freeze({
  attempt: event.attempt,
  inputTokens: null,
  latencyMs: "safeProtocol" in event
    ? event.safeProtocol.latencyMs
    : null,
  outputTokens: null,
  phase: event.phase,
  ...("passed" in event ? { passed: event.passed } : {}),
  ...("protocolFailure" in event && event.protocolFailure
    ? { protocolFailure: event.protocolFailure }
    : {}),
  ...("retryScheduled" in event
    ? { retryScheduled: event.retryScheduled }
    : {}),
  role,
  ...("safeProtocol" in event
    ? { safeProtocol: Object.freeze({ ...event.safeProtocol }) }
    : {}),
  ...(event.phase === "failed"
    ? {
        failureReason: event.reason,
        schemaIssues: sanitizeSchemaIssues(event),
      }
    : {}),
  totalTokens: null,
});

const transportFailureReasons = new Set<StructuredAttemptFailureReason>([
  "connection_reset",
  "network_transport",
  "non_retryable_transport",
  "provider_5xx",
  "rate_limit",
]);

const emptyResidualEvidence = (): ProductionResidualRoleEvidence =>
  Object.freeze({
    completedResponses: 0,
    failureCode: null,
    inputTokens: null,
    latencyMs: null,
    outputTokens: null,
    providerAttempts: 0,
    providerLatenciesMs: Object.freeze([]),
    rejectionReason: null,
    semanticValidationPasses: 0,
    semanticValidationsCompleted: 0,
    status: "not_called",
    strictSchemaPasses: 0,
    timeoutAttempts: 0,
    totalTokens: null,
    transportFailures: 0,
  });

export type ProductionResidualObserver = StructuredProviderAttemptObserver &
  Readonly<{
    getRoleEvidence: () => ProductionResidualRoleEvidence;
  }>;

export const createProductionResidualObserver = (input: Readonly<{
  observe: (event: SanitizedRoleEvent) => void;
}>): ProductionResidualObserver => {
  let evidence = emptyResidualEvidence();
  const providerLatencies = new Map<number, number>();
  const observer: StructuredProviderAttemptObserver = (event) => {
    const latencyMs = "safeProtocol" in event
      ? event.safeProtocol.latencyMs
      : null;
    if (
      latencyMs !== null
      && (
        event.phase === "providerResponseReceived"
        || event.phase === "failed"
      )
    ) {
      providerLatencies.set(event.attempt, latencyMs);
    }
    evidence = Object.freeze({
      ...evidence,
      completedResponses: evidence.completedResponses
        + (event.phase === "providerResponseReceived" ? 1 : 0),
      latencyMs: latencyMs === null
        ? evidence.latencyMs
        : Math.max(evidence.latencyMs ?? 0, latencyMs),
      providerAttempts: evidence.providerAttempts
        + (event.phase === "providerRequestStarted" ? 1 : 0),
      providerLatenciesMs: Object.freeze(
        [...providerLatencies.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, value]) => value),
      ),
      semanticValidationPasses: evidence.semanticValidationPasses
        + (event.phase === "semanticValidationCompleted" && event.passed ? 1 : 0),
      semanticValidationsCompleted: evidence.semanticValidationsCompleted
        + (event.phase === "semanticValidationCompleted" ? 1 : 0),
      status: event.phase === "semanticValidationCompleted"
        ? event.passed ? "success" : "unavailable"
        : evidence.status === "not_called"
          && event.phase === "providerRequestStarted"
          ? "unavailable"
          : evidence.status,
      strictSchemaPasses: evidence.strictSchemaPasses
        + (event.phase === "strictSchemaValidated" ? 1 : 0),
      timeoutAttempts: evidence.timeoutAttempts
        + (event.phase === "failed" && event.reason === "timeout" ? 1 : 0),
      transportFailures: evidence.transportFailures
        + (
          event.phase === "failed" && transportFailureReasons.has(event.reason)
            ? 1
            : 0
        ),
    });
    observeSafely(input.observe, sanitizeStructuredAttempt(event, "residual_planner"));
  };
  return Object.assign(observer, {
    getRoleEvidence: () => evidence,
  });
};

export type ProductionFullAdapter = typeof runOrchestrator & Readonly<{
  getRoleEvidence: () => ProductionFullRoleEvidence;
}>;

export const createProductionFullAdapter = (input: Readonly<{
  clock?: () => number;
  modelConfig: ModelConfig;
  modelFactory?: ModelFactory;
  observe: (event: SanitizedRoleEvent) => void;
  recorder: ModelCallBudgetRecorder;
  retryBudget: { schema: number; transport: number };
}>): ProductionFullAdapter => {
  const clock = input.clock ?? Date.now;
  let evidence = emptyFullEvidence();

  const adapter = async (
    message: string,
    context: AgentPromptContext,
  ) => {
    const startedAt = clock();
    let providerAttempts = 0;
    let completedResponses = 0;
    let strictSchemaPasses = 0;
    let semanticValidationPasses = 0;
    let semanticValidationsCompleted = 0;
    let timeoutAttempts = 0;
    let transportFailures = 0;
    const providerLatencies = new Map<number, number>();
    const result = await runLangChainOrchestratorResult({
      context,
      message,
      modelConfig: input.modelConfig,
      ...(input.modelFactory ? { modelFactory: input.modelFactory } : {}),
      structuredRetryBudget: input.retryBudget,
      providerAttemptObserver: (event) => {
        if (event.phase === "providerRequestStarted") {
          providerAttempts += 1;
          input.recorder.recordProviderAttempt("orchestrator");
        } else if (event.phase === "providerResponseReceived") {
          completedResponses += 1;
        } else if (event.phase === "strictSchemaValidated") {
          strictSchemaPasses += 1;
        } else if (event.phase === "semanticValidationCompleted") {
          semanticValidationsCompleted += 1;
          if (event.passed) semanticValidationPasses += 1;
        } else if (event.phase === "failed") {
          if (event.reason === "timeout") timeoutAttempts += 1;
          if (transportFailureReasons.has(event.reason)) {
            transportFailures += 1;
          }
        }
        if (
          "safeProtocol" in event
          && event.safeProtocol.latencyMs !== null
          && (
            event.phase === "providerResponseReceived"
            || event.phase === "failed"
          )
        ) {
          providerLatencies.set(event.attempt, event.safeProtocol.latencyMs);
        }
        observeSafely(input.observe, sanitizeStructuredAttempt(event));
      },
    });
    const latencyMs = Math.max(0, clock() - startedAt);
    evidence = Object.freeze({
      completedResponses,
      clarificationSource:
        result.status === "clarified"
          ? result.clarificationSource
          : null,
      decisionConsistencyError:
        result.status === "unavailable"
          ? result.decisionConsistencyError ?? null
          : null,
      failureCode: result.status === "unavailable" ? result.reason : null,
      inputTokens: null,
      latencyMs,
      outputTokens: null,
      providerAttempts,
      providerLatenciesMs: Object.freeze(
        [...providerLatencies.entries()]
          .sort(([left], [right]) => left - right)
          .map(([, value]) => value),
      ),
      queryScopeErrorCode:
        "queryScopeErrorCode" in result
          ? result.queryScopeErrorCode ?? null
          : null,
      resourceIssueCodes: Object.freeze(
        "resourceIssueCodes" in result
          ? [...(result.resourceIssueCodes ?? [])]
          : [],
      ),
      schedulePlanReferenceCorrectionCode:
        result.status === "success"
          ? result.schedulePlanReferenceCorrectionCode
          : null,
      schedulePlanReferenceErrorCode:
        "schedulePlanReferenceErrorCode" in result
          ? result.schedulePlanReferenceErrorCode ?? null
          : null,
      semanticProjection: result.schemaValidDecision
        ? Object.freeze({
            ...result.schemaValidDecision,
            intents: Object.freeze([...result.schemaValidDecision.intents]),
          })
        : null,
      semanticValidationPasses,
      semanticValidationsCompleted,
      status: result.status,
      strictSchemaPasses,
      timeoutAttempts,
      totalTokens: null,
      transportFailures,
    });
    observeSafely(input.observe, Object.freeze({
      attempt: providerAttempts || null,
      ...(result.status === "unavailable"
        ? { failureCode: result.reason }
        : {}),
      inputTokens: null,
      latencyMs,
      outputTokens: null,
      phase: "terminal",
      role: "full_orchestrator",
      status: result.status,
      totalTokens: null,
    }));
    return result.status === "unavailable"
      ? projectOrchestratorFailureToSafePlan()
      : result.plan;
  };

  return Object.assign(adapter, {
    getRoleEvidence: () => evidence,
  }) as ProductionFullAdapter;
};

export type ProductionAnswerAdapterInput = Readonly<{
  context: AgentPromptContext;
  intent: AgentIntent;
  message: string;
  scopeId: string;
}>;

export type ProductionAnswerAdapter = (
  input: ProductionAnswerAdapterInput,
) => Promise<ProductionAnswerRoleEvidence>;

const answerStatus = (
  terminal: ConversationalAnswerTerminalState,
): ProductionAnswerRoleEvidence["status"] => terminal.status;

export const createProductionAnswerAdapter = (input: Readonly<{
  clock?: () => number;
  model?: BaseChatModel;
  modelConfig: ModelConfig;
  modelFactory?: ModelFactory;
  observe: (event: SanitizedRoleEvent) => void;
  recorder: ModelCallBudgetRecorder;
  timeouts?: RunConversationalAnswerInput["timeouts"];
}>): ProductionAnswerAdapter => async (request) => {
  const clock = input.clock ?? Date.now;
  const before = input.recorder.snapshot();
  const startedAt = clock();
  let outputTokens = 0;
  const terminal = await runConversationalAnswer({
    callScopeId: request.scopeId,
    emitToken: (token, block) => {
      if (block === undefined || block === "response") {
        outputTokens += estimateTokenCount(token);
      }
    },
    intent: request.intent,
    message: request.message,
    ...(input.model ? { model: input.model } : {}),
    modelCallRecorder: input.recorder,
    modelConfig: input.modelConfig,
    ...(input.modelFactory ? { modelFactory: input.modelFactory } : {}),
    ...(input.timeouts ? { timeouts: input.timeouts } : {}),
    workspaceContext: JSON.stringify(request.context),
  });
  const latencyMs = Math.max(0, clock() - startedAt);
  const after = input.recorder.snapshot();
  const inputTokens = estimateTokenCount({
    context: request.context,
    message: request.message,
  });
  const evidence: ProductionAnswerRoleEvidence = Object.freeze({
    failureCode: terminal.status === "complete" ? null : terminal.errorCode,
    inputTokens,
    latencyMs,
    logicalCalls: Math.max(
      0,
      after.answerLogicalCalls - before.answerLogicalCalls,
    ),
    outputTokens,
    providerAttempts: Math.max(
      0,
      after.answerProviderAttempts - before.answerProviderAttempts,
    ),
    status: answerStatus(terminal),
    totalTokens: inputTokens + outputTokens,
  });
  observeSafely(input.observe, Object.freeze({
    answerStatus: terminal.status,
    attempt: evidence.providerAttempts || null,
    ...(terminal.status === "complete"
      ? {}
      : { failureCode: terminal.errorCode }),
    inputTokens,
    latencyMs,
    outputTokens,
    phase: "terminal",
    role: "answer_renderer",
    totalTokens: inputTokens + outputTokens,
  }));
  return evidence;
};
