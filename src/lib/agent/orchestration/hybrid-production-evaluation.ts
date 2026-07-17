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
import type { AgentChatResponse } from "../schemas";
import type { AgentThread } from "@/payload-types";
import {
  createModelCallBudgetRecorder,
  projectModelCallBudget,
} from "./model-call-budget";
import type { InjectedResidualInvoke } from "./residual-langchain-planner";
import type { runOrchestrator } from "./orchestrator";

export type HybridProductionEvaluationObservation = Readonly<{
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  boundaryResolutionKind:
    | "clarify"
    | "compound"
    | "not_applicable"
    | "pure_query";
  businessMutations: number;
  candidateValidationResult: "not_called" | "rejected" | "valid";
  databaseConnections: number;
  finalDependencies: readonly Readonly<{
    dependsOn: readonly string[];
    taskId: string;
  }>[];
  finalTaskIntents: readonly string[];
  fixedQueryIntent: string | null;
  fixedTaskOwnership: "deterministic_query_boundary" | null;
  fixtureId: string;
  fullOrchestratorLogicalCalls: number;
  fullOrchestratorProviderAttempts: number;
  mapperReached: boolean;
  queryCommentaryLogicalCalls: number;
  queryCommentaryProviderAttempts: number;
  queryDispatcherDecision: "adopted" | "legacy" | "not_called";
  replanLogicalCalls: number;
  replanProviderAttempts: number;
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  taskExecutions: number;
  unexpectedDuplicateModelCalls: number;
  usableStatus: "unavailable" | "usable";
}>;

export type HybridProductionEvaluationInput = Readonly<{
  authenticatedActor: Readonly<{
    collection: "users";
    id: number;
    isAdmin: boolean;
  }>;
  context: AgentPromptContext;
  fixtureId: string;
  fullOrchestratorAdapter?: typeof runOrchestrator;
  message: string;
  queryAdoption: "admin" | "off";
  queryCommentaryAdapter?: (
    facts: QueryFacts,
  ) => Promise<QualitativeCommentaryResult>;
  queryRuntime: "langchain" | "legacy";
  residualInvoke?: InjectedResidualInvoke;
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
    const hybridState: {
      boundaryResolutionKind:
        HybridProductionEvaluationObservation["boundaryResolutionKind"];
      candidateValidationResult:
        HybridProductionEvaluationObservation["candidateValidationResult"];
    } = {
      boundaryResolutionKind: "not_applicable",
      candidateValidationResult: "not_called",
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
      } else if (observation.type === "candidate_validation") {
        hybridState.candidateValidationResult = observation.result;
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

    const result = await runOrchestrationStep({
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

    let queryDispatcherDecision:
      HybridProductionEvaluationObservation["queryDispatcherDecision"] =
        "not_called";
    if (
      hybridState.boundaryResolutionKind === "pure_query"
      && result.outcome === "continue"
      && result.data.preResolvedIntent
    ) {
      const queryResult = await dispatchPreResolvedQuery({
        actor: { isAdmin: input.authenticatedActor.isAdmin },
        adoption: resolveQueryAdoption(),
        intent: result.data.preResolvedIntent,
        loadFacts: async (intent) => loadFixtureFacts(input.context, intent),
        message: input.message,
        modelCallRecorder: recorder,
        ...(input.queryCommentaryAdapter
          ? { runCommentary: input.queryCommentaryAdapter }
          : {}),
        runtime: resolveQueryRuntime(),
      });
      queryDispatcherDecision =
        queryResult.outcome === "legacy" ? "legacy" : "adopted";
    }

    const finalPlan = result.outcome === "compound"
      ? result.data.plan
      : null;
    const accounting = projectModelCallBudget(recorder.snapshot());
    const usableStatus =
      result.outcome === "early_exit"
      || hybridState.candidateValidationResult === "rejected"
        ? "unavailable"
        : "usable";

    return Object.freeze({
      ...accounting,
      boundaryResolutionKind: hybridState.boundaryResolutionKind,
      businessMutations,
      candidateValidationResult: hybridState.candidateValidationResult,
      databaseConnections,
      finalDependencies: Object.freeze(
        (finalPlan?.tasks ?? []).map((task) => Object.freeze({
          dependsOn: Object.freeze([...task.dependsOn]),
          taskId: task.id,
        })),
      ),
      finalTaskIntents: Object.freeze(
        (finalPlan?.tasks ?? []).map((task) => task.intent),
      ),
      fixedQueryIntent,
      fixedTaskOwnership,
      fixtureId: sanitizeFixtureId(input.fixtureId),
      mapperReached,
      queryDispatcherDecision,
      taskExecutions,
      usableStatus,
    });
  });
