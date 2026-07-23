/**
 * Sanitized R4 Hybrid evaluation through the production orchestration entry.
 *
 * The evaluator injects only actor-authorized fixture data and explicit
 * boundary adapters. It never accepts a final plan, dispatcher decision, or
 * candidate-validation result from its caller.
 */

import type { Payload } from "payload";

import {
  runOrchestrationStep,
  type HybridOrchestrationStepObservation,
} from "../chat-pipeline/orchestration-step";
import type { QualitativeCommentaryResult } from "../query/qualitative-commentary";
import { dispatchPreResolvedQuery } from "../query/dispatcher";
import { resolveQueryAdoption, resolveQueryRuntime } from "../query/runtime-config";
import type { QueryFacts } from "../query/types";
import type { AgentPromptContext } from "../prompts";
import type { AgentChatResponse, AgentIntent } from "../schemas";
import type { ModelConfig } from "../llm/model-config";
import type { SafeAnswerErrorCode } from "../answer/types";
import type { AgentThread } from "@/payload-types";
import {
  createModelCallBudgetRecorder,
  projectModelCallBudget,
  type ModelCallBudgetProjection,
  type ModelCallBudgetRecorder,
} from "./model-call-budget";
import {
  classifyHybridObservation,
  type HybridFocusedFixtureExpectation,
  type HybridFocusedRound,
  type HybridLiveObservation,
} from "./hybrid-focused-gate";
import type {
  InjectedResidualInvoke,
  ResidualPlannerFailureCode,
  ResidualRejectionReason,
} from "./residual-langchain-planner";
import type { HybridCandidateValidationErrorCode } from "./hybrid-candidate-validator";
import type { runOrchestrator } from "./orchestrator";
import type {
  L3BEvaluationFixture,
  L3BKnownIdDiagnostic,
} from "./l3b-evaluation-fixtures";
import type { OrchestratorFailureReason } from "./langchain-orchestrator";
import { classifyIntents } from "./safety-classifier";
import {
  createProductionResidualObserver,
  emptyProductionAnswerEvidence,
  type ProductionAnswerAdapter,
  type ProductionAnswerRoleEvidence,
  type ProductionFullAdapter,
  type ProductionFullRoleEvidence,
  type ProductionResidualObserver,
  type ProductionRoleEvidence,
} from "./l3b-production-gate-model-adapters";

export type { ProductionRoleEvidence } from "./l3b-production-gate-model-adapters";

export type ProductionBranchKind =
  | "consultation_preflight"
  | "deterministic_clarify"
  | "full_orchestrator"
  | "hybrid_compound"
  | "pure_query"
  | "unavailable";

export type ProductionKnownIdOutcome =
  | "exact_reference"
  | "safe_rejection"
  | "unsafe_acceptance"
  | "unrelated_failure";

export type ProductionGateFailureCode =
  | `answer_${SafeAnswerErrorCode}`
  | `full_${OrchestratorFailureReason}`
  | `residual_${ResidualPlannerFailureCode}`
  | "answer_incomplete"
  | "answer_unavailable"
  | "hybrid_candidate_unavailable"
  | "invalid_dag"
  | "query_dispatch_not_adopted"
  | "query_dispatch_unavailable"
  | "semantic_mismatch"
  | "terminal_failure"
  | "unsafe_side_effect";

export type ProductionGateObservation = Readonly<{
  fixtureId: string;
  round: 1 | 2 | 3;
  observationIndex: number;
  branchKind: ProductionBranchKind;
  finalMode: "compound" | "single" | null;
  finalTaskIntents: readonly string[];
  finalDependencies: readonly Readonly<{
    taskId: string;
    dependsOn: readonly string[];
  }>[];
  clarifyQuestionPresent: boolean;
  semanticMatch: boolean;
  usable: boolean;
  failureCodes: readonly ProductionGateFailureCode[];
  callAccounting: ModelCallBudgetProjection;
  roleEvidence: ProductionRoleEvidence;
  latencyMs: number;
  knownIdOutcome: ProductionKnownIdOutcome | null;
  taskExecutions: number;
  taskExecutionAttempts: number;
  databaseConnections: number;
  databaseAccessAttempts: number;
  databaseMutationAttempts: number;
  draftPathsReached: number;
  businessMutations: number;
  businessMutationAttempts: number;
  rawRetentionViolation: boolean;
  writeWithoutDraftViolations: number;
}>;

export type ProductionGateEvaluationInput = Readonly<{
  answerAdapter: ProductionAnswerAdapter;
  authenticatedActor: Readonly<{
    collection: "users";
    id: number;
    isAdmin: boolean;
  }>;
  clock?: () => number;
  fixture: L3BEvaluationFixture | L3BKnownIdDiagnostic;
  fullOrchestratorAdapter: ProductionFullAdapter;
  modelCallRecorder: ModelCallBudgetRecorder;
  observationIndex?: number;
  residualInvoke?: InjectedResidualInvoke;
  residualModelConfig?: ModelConfig;
  residualPlannerProviderAttemptObserver?: ProductionResidualObserver;
  round?: 1 | 2 | 3;
}>;

export type HybridProductionEvaluationObservation = HybridLiveObservation;

export type HybridProductionEvaluationInput = Readonly<{
  authenticatedActor: Readonly<{
    collection: "users";
    id: number;
    isAdmin: boolean;
  }>;
  clock?: () => number;
  context: AgentPromptContext;
  expectation?: HybridFocusedFixtureExpectation;
  fixtureId: string;
  fullOrchestratorAdapter?: typeof runOrchestrator;
  message: string;
  queryAdoption: "admin" | "off";
  queryCommentaryAdapter?: (
    facts: QueryFacts,
  ) => Promise<QualitativeCommentaryResult>;
  queryRuntime: "langchain" | "legacy";
  residualInvoke?: InjectedResidualInvoke;
  residualModelConfig?: ModelConfig;
  round?: HybridFocusedRound;
  observationIndex?: number;
}>;

const tokenUsage = (): NonNullable<AgentChatResponse["tokenUsage"]> => ({
  contextTokens: 0,
  inputTokens: 0,
  outputTokens: 0,
  providerInputTokens: 0,
  providerOutputTokens: 0,
  source: "estimate",
  totalTokens: 0,
});

const sanitizeFixtureId = (fixtureId: string): string =>
  fixtureId.replace(/[^a-zA-Z0-9_-]/gu, "").slice(0, 80);

const aggregateFacts = (
  context: AgentPromptContext,
): QueryFacts => {
  const activePlans = context.plans.filter(
    (plan) => plan.state === "active",
  ).length;
  return {
    args: { scope: "all" },
    kind: "aggregate_progress",
    snapshot: {
      checklists: [],
      generatedAt: context.now,
      summary: {
        activePlans,
        backlogPlans: context.plans.filter(
          (plan) => plan.state === "backlog",
        ).length,
        checklistCount: 0,
        completedChecklistItems: 0,
        completedPlans: context.plans.filter(
          (plan) => plan.state === "done",
        ).length,
        dueSoonPlans: 0,
        highPriorityPlans: context.plans.filter(
          (plan) => plan.priority === "high",
        ).length,
        overallChecklistCompletionRate: 0,
        overduePlans: 0,
        pausedPlans: context.plans.filter(
          (plan) => plan.state === "paused",
        ).length,
        planCount: context.plans.length,
        totalChecklistItems: 0,
      },
    },
  };
};

const loadFixtureFacts = (
  context: AgentPromptContext,
  intent: Parameters<typeof dispatchPreResolvedQuery>[0]["intent"],
): QueryFacts | null => {
  if (intent.intent === "query_progress") {
    return aggregateFacts(context);
  }
  if (intent.intent !== "query_plan_progress") return null;

  const planId = intent.args.planId;
  const plan = context.plans.find((candidate) => candidate.id === planId);
  if (!plan || typeof plan.id !== "number") return null;
  return {
    dueDate: plan.dueDate ?? null,
    executionMode: plan.executionMode ?? null,
    kind: "plan_progress",
    phases: [],
    phasesProvided: false,
    planId: plan.id,
    priority: plan.priority ?? null,
    state: plan.state ?? null,
    storedProgressPercent: null,
    title: plan.title ?? "",
    totalEstimatedDays: null,
    weeklyRhythm: null,
  };
};

const withFrozenRuntime = async <T>(
  input: HybridProductionEvaluationInput,
  run: () => Promise<T>,
): Promise<T> => {
  const names = [
    "AGENT_ORCHESTRATOR_RUNTIME",
    "AGENT_QUERY_ADOPTION",
    "AGENT_QUERY_RUNTIME",
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  process.env.AGENT_QUERY_ADOPTION = input.queryAdoption;
  process.env.AGENT_QUERY_RUNTIME = input.queryRuntime;
  try {
    return await run();
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

export const evaluateHybridProductionCase = async (
  input: HybridProductionEvaluationInput,
): Promise<HybridProductionEvaluationObservation> =>
  withFrozenRuntime(input, async () => {
    const recorder = createModelCallBudgetRecorder();
    const clock = input.clock ?? Date.now;
    const hybridState: {
      boundaryResolutionKind:
        HybridProductionEvaluationObservation["boundaryResolutionKind"];
      candidateFailureCode: HybridCandidateValidationErrorCode | undefined;
      candidateValidationResult:
        HybridProductionEvaluationObservation["candidateValidationResult"];
      provenanceSource:
        HybridProductionEvaluationObservation["provenanceSource"];
      queryScope: HybridProductionEvaluationObservation["queryScope"];
      residualFailureCode: ResidualPlannerFailureCode | undefined;
      residualRejectionReason: ResidualRejectionReason | null;
      residualStatus: "not_called" | "success" | "unavailable";
    } = {
      boundaryResolutionKind: "not_applicable",
      candidateFailureCode: undefined,
      candidateValidationResult: "not_called",
      provenanceSource: "none",
      queryScope: "none",
      residualFailureCode: undefined,
      residualRejectionReason: null,
      residualStatus: "not_called",
    };
    let databaseConnections = 0;
    let businessMutations = 0;
    let taskExecutions = 0;
    let fixedQueryIntent: string | null = null;
    let fixedTaskOwnership:
      HybridProductionEvaluationObservation["fixedTaskOwnership"] = null;
    let mapperReached = false;

    const observeHybrid = (
      observation: HybridOrchestrationStepObservation,
    ) => {
      if (observation.type === "boundary") {
        hybridState.boundaryResolutionKind =
          observation.boundaryResolutionKind;
        fixedQueryIntent = observation.fixedQueryIntent;
        fixedTaskOwnership = observation.fixedTaskOwnership;
        hybridState.provenanceSource = observation.provenanceSource;
        hybridState.queryScope = observation.queryScope;
      } else if (observation.type === "candidate_validation") {
        hybridState.candidateFailureCode =
          observation.code ?? undefined;
        hybridState.candidateValidationResult = observation.result;
      } else if (observation.type === "residual_planning") {
        hybridState.residualFailureCode = observation.code ?? undefined;
        hybridState.residualRejectionReason =
          observation.rejectionReason;
        hybridState.residualStatus = observation.status;
      } else if (observation.type === "mapper") {
        mapperReached = observation.reached;
      }
    };
    const payload = new Proxy({} as Payload, {
      get: () => {
        databaseConnections += 1;
        throw new Error("Hybrid evaluation forbids database access.");
      },
    });

    let terminalFailure = false;
    let result: Awaited<ReturnType<typeof runOrchestrationStep>> | null =
      null;
    const startedAt = clock();
    try {
      result = await runOrchestrationStep({
        context: input.context,
        deferCompoundExecution: true,
        emitStatus: () => undefined,
        emitToken: () => undefined,
        executeAction: async () => {
          taskExecutions += 1;
          throw new Error("Hybrid evaluation forbids task execution.");
        },
        message: input.message,
        modelCallRecorder: recorder,
        onHybridObservation: observeHybrid,
        payload,
        pendingAction: null,
        persistAgentTurn: async () => {
          businessMutations += 1;
          return { id: 0 } as AgentThread;
        },
        pushTrace: () => undefined,
        residualPlannerInvoke: input.residualInvoke,
        residualPlannerModelConfig: input.residualModelConfig,
        ...(input.fullOrchestratorAdapter
          ? { runOrchestratorFn: input.fullOrchestratorAdapter }
          : {}),
        tokenUsage: tokenUsage(),
        trace: [],
        user: {
          collection: input.authenticatedActor.collection,
          id: input.authenticatedActor.id,
        },
      });
    } catch {
      terminalFailure = true;
    }
    const completedAt = clock();

    let queryDispatcherDecision:
      HybridProductionEvaluationObservation["queryDispatcherDecision"] =
        "not_called";
    if (
      hybridState.boundaryResolutionKind === "pure_query"
      && result?.outcome === "continue"
    ) {
      if (!result.data.preResolvedIntent) {
        queryDispatcherDecision = "ineligible";
      } else {
        try {
          const queryResult = await dispatchPreResolvedQuery({
            actor: { isAdmin: input.authenticatedActor.isAdmin },
            adoption: resolveQueryAdoption(),
            intent: result.data.preResolvedIntent,
            loadFacts: async (intent) =>
              loadFixtureFacts(input.context, intent),
            message: input.message,
            modelCallRecorder: recorder,
            ...(input.queryCommentaryAdapter
              ? { runCommentary: input.queryCommentaryAdapter }
              : {}),
            runtime: resolveQueryRuntime(),
          });
          queryDispatcherDecision =
            queryResult.outcome === "legacy" ? "legacy" : "adopted";
        } catch {
          queryDispatcherDecision = "unavailable";
        }
      }
    }

    const finalPlan = result?.outcome === "compound"
      ? result.data.plan
      : null;
    const finalIntent = result?.outcome === "continue"
      ? result.data.preResolvedIntent?.intent ?? null
      : result?.outcome === "early_exit"
        ? result.response.intent
        : null;
    const finalTaskIntents = Object.freeze(
      finalPlan
        ? finalPlan.tasks.map((task) => task.intent)
        : finalIntent
          ? [finalIntent]
          : [],
    );
    const finalDependencies = Object.freeze(
      finalPlan
        ? finalPlan.tasks.map((task) => Object.freeze({
            dependsOn: Object.freeze([...task.dependsOn]),
            taskId: task.id,
          }))
        : finalIntent
          ? [Object.freeze({
              dependsOn: Object.freeze([] as string[]),
              taskId: "t1",
            })]
          : [],
    );
    const accounting = projectModelCallBudget(recorder.snapshot());
    const expectation = input.expectation ?? {
      boundaryResolutionKind:
        hybridState.boundaryResolutionKind === "not_applicable"
          ? "pure_query"
          : hybridState.boundaryResolutionKind,
      finalTaskIntents,
    };
    const timeout = hybridState.residualFailureCode === "timeout";
    const providerFailure =
      hybridState.residualFailureCode === "provider_error";
    const classification = classifyHybridObservation({
      boundaryResolutionKind: hybridState.boundaryResolutionKind,
      candidateFailureCode: hybridState.candidateFailureCode,
      candidateValidationResult: hybridState.candidateValidationResult,
      expectation,
      finalTaskIntents,
      mapperReached,
      providerFailure,
      queryDispatcherDecision,
      residualFailureCode: hybridState.residualFailureCode,
      terminalFailure,
      timeout,
    });

    return Object.freeze({
      ...accounting,
      boundaryResolutionKind: hybridState.boundaryResolutionKind,
      businessMutations,
      candidateValidationResult: hybridState.candidateValidationResult,
      databaseConnection: databaseConnections > 0,
      databaseConnections,
      databaseMutation: businessMutations > 0,
      failureCode: classification.failureCode,
      finalDependencies,
      finalTaskIntents,
      fixedQueryIntent,
      fixedTaskOwnership,
      fixtureId: sanitizeFixtureId(input.fixtureId),
      latencyMs: Math.max(0, completedAt - startedAt),
      mapperReached,
      observationIndex: Math.max(
        1,
        Math.floor(input.observationIndex ?? 1),
      ),
      provenanceSource: hybridState.provenanceSource,
      providerFailure,
      queryDispatcherDecision,
      queryScope: hybridState.queryScope,
      rawRetentionViolation: false,
      residualRejectionReason: hybridState.residualRejectionReason,
      residualSchemaValid: classification.residualSchemaValid,
      round: input.round ?? 1,
      semanticMatch: classification.semanticMatch,
      taskExecution: taskExecutions > 0,
      taskExecutions,
      timeout,
      usableStatus: classification.usableStatus,
    });
  });

const omitProductionQueryCommentary =
  async (): Promise<QualitativeCommentaryResult> => ({
    latencyMs: 0,
    modelCalls: 0,
    reason: "provider_error",
    status: "omitted",
    ttftMs: null,
  });

const withProductionGateRuntime = async <T>(
  run: () => Promise<T>,
): Promise<T> => {
  const names = [
    "AGENT_ORCHESTRATOR_RUNTIME",
    "AGENT_QUERY_ADOPTION",
    "AGENT_QUERY_RUNTIME",
  ] as const;
  const previous = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  process.env.AGENT_ORCHESTRATOR_RUNTIME = "langchain";
  process.env.AGENT_QUERY_ADOPTION = "admin";
  process.env.AGENT_QUERY_RUNTIME = "langchain";
  try {
    return await run();
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
};

const hasValidDependencyGraph = (
  dependencies: readonly Readonly<{
    dependsOn: readonly string[];
    taskId: string;
  }>[],
): boolean => {
  const ids = new Set(dependencies.map((entry) => entry.taskId));
  if (ids.size !== dependencies.length) return false;
  if (dependencies.some((entry) =>
    entry.dependsOn.some((dependency) =>
      dependency === entry.taskId || !ids.has(dependency)
    )
  )) return false;

  const byId = new Map(
    dependencies.map((entry) => [entry.taskId, entry.dependsOn] as const),
  );
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (taskId: string): boolean => {
    if (visiting.has(taskId)) return false;
    if (visited.has(taskId)) return true;
    visiting.add(taskId);
    for (const dependency of byId.get(taskId) ?? []) {
      if (!visit(dependency)) return false;
    }
    visiting.delete(taskId);
    visited.add(taskId);
    return true;
  };
  return [...ids].every(visit);
};

const matchesFixtureExpectation = (
  fixture: L3BEvaluationFixture,
  finalMode: ProductionGateObservation["finalMode"],
  finalTaskIntents: readonly string[],
  clarifyQuestionPresent: boolean,
  dagValid: boolean,
): boolean => {
  if (finalMode !== fixture.expected.mode || !dagValid) return false;
  const intentsMatch = fixture.expected.mode === "compound"
    ? finalTaskIntents.length === fixture.expected.intents.length
      && finalTaskIntents.every(
        (intent, index) => intent === fixture.expected.intents[index],
      )
    : finalTaskIntents.length === 1
      && fixture.expected.intents.includes(finalTaskIntents[0] ?? "");
  if (!intentsMatch) return false;
  return finalTaskIntents[0] !== "clarify" || clarifyQuestionPresent;
};

const isKnownIdDiagnostic = (
  fixture: L3BEvaluationFixture | L3BKnownIdDiagnostic,
): fixture is L3BKnownIdDiagnostic =>
  typeof fixture.expected === "string";

const classifyKnownIdOutcome = (input: Readonly<{
  context: AgentPromptContext;
  finalIntent: AgentIntent | null;
  finalTaskIntents: readonly string[];
  fullEvidence: ProductionFullRoleEvidence;
  terminalFailure: boolean;
}>): ProductionKnownIdOutcome => {
  if (input.terminalFailure) return "unrelated_failure";

  const safetyClass = classifyIntents([...input.finalTaskIntents]);
  const acceptedWrite =
    safetyClass === "mixed" || safetyClass === "write_candidate";
  const exactPlanId = input.finalIntent?.intent === "schedule_plan"
    ? input.finalIntent.args.planId
    : null;
  const exactReference =
    input.fullEvidence.status === "success"
    && exactPlanId !== null
    && input.context.plans.some(
      (plan) =>
        typeof plan.id === "number"
        && plan.id === exactPlanId,
    );
  if (exactReference) return "exact_reference";

  const resourceEvidence =
    input.fullEvidence.resourceIssueCodes.length > 0;
  const typedResourceRejection =
    resourceEvidence
    && (
      (
        input.fullEvidence.status === "clarified"
        && input.fullEvidence.clarificationSource === "resource_readiness"
      )
      || (
        input.fullEvidence.status === "unavailable"
        && input.fullEvidence.failureCode === "invalid_resource_reference"
      )
    );
  if (typedResourceRejection && !acceptedWrite) return "safe_rejection";
  if (acceptedWrite) return "unsafe_acceptance";
  return "unrelated_failure";
};

const answerFailureEvidence = (): ProductionAnswerRoleEvidence =>
  Object.freeze({
    ...emptyProductionAnswerEvidence(),
    failureCode: "provider_error",
    status: "unavailable",
  });

/**
 * Evaluate one frozen L3-B fixture through the same top-level orchestration
 * step used by production. Compound execution and every mutation surface are
 * replaced with fail-fast sentinels.
 */
export const evaluateProductionGateCase = async (
  input: ProductionGateEvaluationInput,
): Promise<ProductionGateObservation> =>
  withProductionGateRuntime(async () => {
    const clock = input.clock ?? Date.now;
    const recorder = input.modelCallRecorder;
    const residualObserver = input.residualPlannerProviderAttemptObserver
      ?? createProductionResidualObserver({ observe: () => undefined });
    let boundaryResolutionKind:
      | "clarify"
      | "compound"
      | "not_applicable"
      | "pure_query"
      | null = null;
    const gateState: {
      candidateValidationResult: "not_called" | "rejected" | "valid";
      residualFailureCode: ResidualPlannerFailureCode | null;
      residualRejectionReason: ResidualRejectionReason | null;
      residualStatus: "not_called" | "success" | "unavailable";
    } = {
      candidateValidationResult: "not_called",
      residualFailureCode: null,
      residualRejectionReason: null,
      residualStatus: "not_called",
    };
    let mapperReached = false;
    let databaseConnections = 0;
    let businessMutations = 0;
    let taskExecutions = 0;
    let terminalFailure = false;
    let queryDispatcherDecision:
      | "complete"
      | "not_called"
      | "not_adopted"
      | "unavailable" = "not_called";

    const payload = new Proxy({} as Payload, {
      get: () => {
        databaseConnections += 1;
        throw new Error("Production gate forbids database access.");
      },
    });
    const startedAt = clock();
    let result: Awaited<ReturnType<typeof runOrchestrationStep>> | null = null;
    try {
      result = await runOrchestrationStep({
        context: input.fixture.context,
        deferCompoundExecution: true,
        emitStatus: () => undefined,
        emitToken: () => undefined,
        executeAction: async () => {
          taskExecutions += 1;
          throw new Error("Production gate forbids task execution.");
        },
        hybridBoundaryMode: "runtime",
        message: input.fixture.message,
        modelCallRecorder: recorder,
        onHybridObservation: (observation) => {
          if (observation.type === "boundary") {
            boundaryResolutionKind = observation.boundaryResolutionKind;
          } else if (observation.type === "candidate_validation") {
            gateState.candidateValidationResult = observation.result;
          } else if (observation.type === "mapper") {
            mapperReached = observation.reached;
          } else if (observation.type === "residual_planning") {
            gateState.residualFailureCode = observation.code;
            gateState.residualRejectionReason = observation.rejectionReason;
            gateState.residualStatus = observation.status;
          }
        },
        payload,
        pendingAction: null,
        persistAgentTurn: async () => {
          businessMutations += 1;
          throw new Error("Production gate forbids persistence.");
        },
        pushTrace: () => undefined,
        residualPlannerInvoke: input.residualInvoke,
        residualPlannerModelConfig: input.residualModelConfig,
        residualPlannerProviderAttemptObserver: residualObserver,
        runOrchestratorFn: input.fullOrchestratorAdapter,
        tokenUsage: tokenUsage(),
        trace: [],
        user: {
          collection: input.authenticatedActor.collection,
          id: input.authenticatedActor.id,
        },
      });
    } catch {
      terminalFailure = true;
    }

    const preResolvedIntent: AgentIntent | null =
      result?.outcome === "continue"
        ? result.data.preResolvedIntent
        : null;
    if (
      boundaryResolutionKind === "pure_query"
      && preResolvedIntent
    ) {
      try {
        const queryResult = await dispatchPreResolvedQuery({
          actor: { isAdmin: input.authenticatedActor.isAdmin },
          adoption: resolveQueryAdoption(),
          intent: preResolvedIntent,
          loadFacts: async (intent) =>
            loadFixtureFacts(input.fixture.context, intent),
          message: input.fixture.message,
          modelCallRecorder: recorder,
          runCommentary: omitProductionQueryCommentary,
          runtime: resolveQueryRuntime(),
        });
        queryDispatcherDecision = queryResult.outcome === "complete"
          ? "complete"
          : "not_adopted";
      } catch {
        queryDispatcherDecision = "unavailable";
      }
    }

    let answerEvidence = emptyProductionAnswerEvidence();
    const answerExpected = !isKnownIdDiagnostic(input.fixture)
      && input.fixture.expected.intents.includes("answer_question");
    if (answerExpected && preResolvedIntent?.intent === "answer_question") {
      try {
        answerEvidence = await input.answerAdapter({
          context: input.fixture.context,
          intent: preResolvedIntent,
          message: input.fixture.message,
          scopeId: `${sanitizeFixtureId(input.fixture.id)}:${input.round ?? 1}:answer`,
        });
      } catch {
        answerEvidence = answerFailureEvidence();
      }
    }

    const fullEvidence = input.fullOrchestratorAdapter.getRoleEvidence();
    const hideSafeFullFailureProjection = fullEvidence.status === "unavailable";
    const finalPlan = !hideSafeFullFailureProjection
      && result?.outcome === "compound"
      ? result.data.plan
      : null;
    const finalIntent = hideSafeFullFailureProjection
      ? null
      : result?.outcome === "continue"
        ? result.data.preResolvedIntent
        : null;
    const finalMode: ProductionGateObservation["finalMode"] = finalPlan
      ? "compound"
      : finalIntent
        ? "single"
        : null;
    const finalTaskIntents = Object.freeze(
      finalPlan
        ? finalPlan.tasks.map((task) => task.intent)
        : finalIntent
          ? [finalIntent.intent]
          : [],
    );
    const finalDependencies = Object.freeze(
      finalPlan
        ? finalPlan.tasks.map((task) => Object.freeze({
            dependsOn: Object.freeze([...task.dependsOn]),
            taskId: task.id,
          }))
        : finalIntent
          ? [Object.freeze({
              dependsOn: Object.freeze([] as string[]),
              taskId: "t1",
            })]
          : [],
    );
    const clarifyQuestionPresent = finalIntent?.intent === "clarify"
      && typeof finalIntent.args.question === "string"
      && finalIntent.args.question.trim().length > 0;
    const dagValid = hasValidDependencyGraph(finalDependencies);
    const knownIdOutcome = isKnownIdDiagnostic(input.fixture)
      ? classifyKnownIdOutcome({
          context: input.fixture.context,
          finalIntent,
          finalTaskIntents,
          fullEvidence,
          terminalFailure,
        })
      : null;
    const semanticMatch = isKnownIdDiagnostic(input.fixture)
      ? input.fixture.expected === "accept_exact_reference"
        ? knownIdOutcome === "exact_reference"
        : knownIdOutcome === "safe_rejection"
      : matchesFixtureExpectation(
          input.fixture,
          finalMode,
          finalTaskIntents,
          clarifyQuestionPresent,
          dagValid,
        );
    const branchKind: ProductionBranchKind = terminalFailure
      || fullEvidence.status === "unavailable"
      ? "unavailable"
      : fullEvidence.status === "clarified"
        ? "deterministic_clarify"
      : boundaryResolutionKind === "pure_query"
        ? "pure_query"
        : boundaryResolutionKind === "clarify"
          ? "deterministic_clarify"
          : boundaryResolutionKind === "compound"
            ? "hybrid_compound"
            : finalIntent?.intent === "answer_question"
              ? "consultation_preflight"
              : boundaryResolutionKind === "not_applicable"
                ? "full_orchestrator"
                : "unavailable";
    const failureCodes: ProductionGateFailureCode[] = [];
    if (fullEvidence.failureCode) {
      failureCodes.push(`full_${fullEvidence.failureCode}`);
    }
    if (gateState.residualFailureCode) {
      failureCodes.push(`residual_${gateState.residualFailureCode}`);
    }
    if (answerEvidence.status === "incomplete") {
      failureCodes.push("answer_incomplete");
    } else if (answerEvidence.status === "unavailable") {
      failureCodes.push("answer_unavailable");
    }
    if (answerEvidence.failureCode) {
      failureCodes.push(`answer_${answerEvidence.failureCode}`);
    }
    if (queryDispatcherDecision === "not_adopted") {
      failureCodes.push("query_dispatch_not_adopted");
    } else if (queryDispatcherDecision === "unavailable") {
      failureCodes.push("query_dispatch_unavailable");
    }
    if (gateState.candidateValidationResult === "rejected") {
      failureCodes.push("hybrid_candidate_unavailable");
    }
    if (!dagValid) failureCodes.push("invalid_dag");
    if (terminalFailure) failureCodes.push("terminal_failure");
    if (!semanticMatch) failureCodes.push("semantic_mismatch");
    if (
      taskExecutions > 0
      || databaseConnections > 0
      || businessMutations > 0
    ) {
      failureCodes.push("unsafe_side_effect");
    }
    const branchRoleUsable = branchKind === "pure_query"
      ? queryDispatcherDecision === "complete"
      : finalTaskIntents[0] === "answer_question"
        ? answerEvidence.status === "complete"
        : branchKind === "hybrid_compound"
          ? gateState.residualStatus === "success"
            && gateState.candidateValidationResult === "valid"
            && mapperReached
          : branchKind !== "unavailable";
    const knownIdUsable = knownIdOutcome !== null
      && semanticMatch
      && (
        knownIdOutcome === "exact_reference"
        || knownIdOutcome === "safe_rejection"
      )
      && dagValid
      && taskExecutions === 0
      && databaseConnections === 0
      && businessMutations === 0
      && recorder.snapshot().unexpectedDuplicateModelCalls === 0;
    const completedAt = clock();

    return Object.freeze({
      branchKind,
      businessMutationAttempts: businessMutations,
      businessMutations,
      callAccounting: projectModelCallBudget(recorder.snapshot()),
      clarifyQuestionPresent,
      databaseAccessAttempts: databaseConnections,
      databaseConnections,
      databaseMutationAttempts: 0,
      draftPathsReached: 0,
      failureCodes: Object.freeze([...new Set(failureCodes)]),
      finalDependencies,
      finalMode,
      finalTaskIntents,
      fixtureId: sanitizeFixtureId(input.fixture.id),
      latencyMs: Math.max(0, completedAt - startedAt),
      knownIdOutcome,
      observationIndex: Math.max(
        1,
        Math.floor(input.observationIndex ?? 1),
      ),
      rawRetentionViolation: false,
      roleEvidence: Object.freeze({
        answerRenderer: answerEvidence,
        fullOrchestrator: fullEvidence,
        queryCommentary: "omitted",
        residualPlanner: Object.freeze({
          ...residualObserver.getRoleEvidence(),
          failureCode: gateState.residualFailureCode,
          rejectionReason: gateState.residualRejectionReason,
          status: gateState.residualStatus,
        }),
      }),
      round: input.round ?? 1,
      semanticMatch,
      taskExecutionAttempts: taskExecutions,
      taskExecutions,
      usable: knownIdOutcome !== null
        ? knownIdUsable
        : semanticMatch
          && branchRoleUsable
          && failureCodes.length === 0,
      writeWithoutDraftViolations: 0,
    });
  });
