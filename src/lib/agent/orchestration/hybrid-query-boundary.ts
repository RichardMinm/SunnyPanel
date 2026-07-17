/**
 * Hybrid Query Boundary coordinator.
 *
 * This is a deterministic orchestration seam for evaluation and production
 * integration. It does not execute tasks: pure Query is handed to the existing
 * Query Dispatcher, compound turns produce a validated candidate, and every
 * unavailable residual result terminates without Legacy fallback.
 */

import type { OrchestratorOutput } from "../llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../prompts";
import type { AgentIntent } from "../schemas";
import type { QueryAdoption, QueryRuntime } from "../query/types";
import { composeFixedTaskPlan } from "./fixed-task-plan-composer";
import type {
  HybridOrchestrationCandidate,
  ResidualPlanningInput,
} from "./hybrid-query-boundary-types";
import {
  buildActorAuthorizedResourceSnapshot,
  isHybridQueryBoundaryEnabled,
  resolveHybridQueryBoundary,
} from "./query-boundary-resolver";
import type { ResidualPlannerResult } from "./residual-langchain-planner";
import {
  resolveOrchestratorRuntimeMode,
  type OrchestratorRuntimeMode,
} from "./runtime-config";

export type HybridCallAccounting = Readonly<{
  fullOrchestratorLogicalCalls: number;
  fullOrchestratorProviderAttempts: number;
  queryCommentaryLogicalCalls: number;
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  unexpectedDuplicateModelCalls: number;
}>;

export type HybridFailureCode =
  | "composer_forbidden_intent"
  | "composer_invalid_fixed_query"
  | "composer_schema_invalid"
  | "composer_unknown_dependency"
  | "full_orchestrator_unavailable"
  | "query_dispatcher_unavailable"
  | "residual_forbidden_intent"
  | "residual_provider_error"
  | "residual_schema_failure"
  | "residual_timeout";

export type HybridOrchestrationResult = Readonly<{
  boundaryResolution:
    | "clarify"
    | "compound"
    | "not_applicable"
    | "pure_query";
  callAccounting: HybridCallAccounting;
  candidate?: HybridOrchestrationCandidate;
  failureCode?: HybridFailureCode;
  output?: OrchestratorOutput;
  queryDispatcherSelection: "adopted" | "legacy" | "not_called";
  status: "unavailable" | "usable";
}>;

export type RunHybridOrchestrationInput = Readonly<{
  authenticatedActor: null | Readonly<{ collection: "users"; id: number }>;
  context: AgentPromptContext;
  originalRequest: string;
  orchestratorRuntime?: OrchestratorRuntimeMode;
  queryAdoption?: QueryAdoption;
  queryRuntime?: QueryRuntime;
  runFullOrchestrator: () => Promise<OrchestratorOutput>;
  runQueryDispatcher: (
    intent: AgentIntent,
    actor: Readonly<{ isAdmin: boolean }>,
  ) => Promise<"adopted" | "legacy">;
  runResidualPlanner: (
    input: ResidualPlanningInput,
  ) => Promise<ResidualPlannerResult>;
}>;

const emptyAccounting = (): HybridCallAccounting => ({
  fullOrchestratorLogicalCalls: 0,
  fullOrchestratorProviderAttempts: 0,
  queryCommentaryLogicalCalls: 0,
  residualPlannerLogicalCalls: 0,
  residualPlannerProviderAttempts: 0,
  unexpectedDuplicateModelCalls: 0,
});

const runFullPath = async (
  input: RunHybridOrchestrationInput,
): Promise<HybridOrchestrationResult> => {
  try {
    const output = await input.runFullOrchestrator();
    return {
      boundaryResolution: "not_applicable",
      callAccounting: {
        ...emptyAccounting(),
        fullOrchestratorLogicalCalls: 1,
      },
      output,
      queryDispatcherSelection: "not_called",
      status: "usable",
    };
  } catch {
    return {
      boundaryResolution: "not_applicable",
      callAccounting: {
        ...emptyAccounting(),
        fullOrchestratorLogicalCalls: 1,
      },
      failureCode: "full_orchestrator_unavailable",
      queryDispatcherSelection: "not_called",
      status: "unavailable",
    };
  }
};

export const runHybridOrchestration = async (
  input: RunHybridOrchestrationInput,
): Promise<HybridOrchestrationResult> => {
  const runtime = input.orchestratorRuntime ?? resolveOrchestratorRuntimeMode();
  if (!isHybridQueryBoundaryEnabled(runtime)) {
    return runFullPath(input);
  }

  const snapshot = buildActorAuthorizedResourceSnapshot({
    authenticatedActor: input.authenticatedActor,
    context: input.context,
  });
  if (!snapshot.valid) return runFullPath(input);

  const boundary = resolveHybridQueryBoundary({
    authorizedSnapshot: snapshot.snapshot,
    originalRequest: input.originalRequest,
  });

  if (boundary.kind === "not_applicable") {
    return runFullPath(input);
  }

  if (boundary.kind === "pure_query") {
    try {
      const selection = await input.runQueryDispatcher(
        boundary.preResolvedIntent,
        { isAdmin: (input.queryAdoption ?? "off") === "admin" },
      );
      return {
        boundaryResolution: "pure_query",
        callAccounting: emptyAccounting(),
        queryDispatcherSelection: selection,
        status: "usable",
      };
    } catch {
      return {
        boundaryResolution: "pure_query",
        callAccounting: emptyAccounting(),
        failureCode: "query_dispatcher_unavailable",
        queryDispatcherSelection: "not_called",
        status: "unavailable",
      };
    }
  }

  if (boundary.kind === "clarify") {
    return {
      boundaryResolution: "clarify",
      callAccounting: emptyAccounting(),
      output: boundary.output,
      queryDispatcherSelection: "not_called",
      status: "usable",
    };
  }

  const residual = await input.runResidualPlanner(boundary.residualInput);
  const accounting: HybridCallAccounting = {
    ...emptyAccounting(),
    residualPlannerLogicalCalls: residual.logicalCalls,
    residualPlannerProviderAttempts: residual.providerAttempts,
    unexpectedDuplicateModelCalls: residual.logicalCalls > 1 ? 1 : 0,
  };
  if (residual.status !== "success") {
    return {
      boundaryResolution: "compound",
      callAccounting: accounting,
      failureCode: `residual_${residual.code}`,
      queryDispatcherSelection: "not_called",
      status: "unavailable",
    };
  }

  const composed = composeFixedTaskPlan({
    fixedMetadata: boundary.fixedMetadata,
    fixedQueryTask: boundary.fixedQueryTask,
    residualTasks: residual.tasks,
  });
  if (composed.status !== "success") {
    return {
      boundaryResolution: "compound",
      callAccounting: accounting,
      failureCode: `composer_${composed.code}`,
      queryDispatcherSelection: "not_called",
      status: "unavailable",
    };
  }

  return {
    boundaryResolution: "compound",
    callAccounting: accounting,
    candidate: composed.candidate,
    queryDispatcherSelection: "not_called",
    status: "usable",
  };
};
