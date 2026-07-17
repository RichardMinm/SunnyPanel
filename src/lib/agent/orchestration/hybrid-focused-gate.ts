/**
 * Sanitized outcome classification and aggregation for the R4 Hybrid gate.
 *
 * This module never calls a model, database, Mapper, or Executor. It projects
 * the frozen focused fixtures and the production recorder into gate-only
 * enums, counters, and latency statistics.
 */

import { L3B_EVALUATION_FIXTURES } from "./l3b-evaluation-fixtures";
import {
  RESIDUAL_PLANNER_RETRY_POLICY,
  type ResidualPlannerFailureCode,
} from "./residual-langchain-planner";
import type { HybridCandidateValidationErrorCode } from "./hybrid-candidate-validator";

export const HYBRID_FOCUSED_FIXTURE_IDS = Object.freeze([
  "qry-1",
  "qry-4",
  "inj-2",
  "cmp-4",
] as const);

export const HYBRID_FOCUSED_ROUNDS = Object.freeze([1, 2, 3] as const);

export type HybridFocusedFixtureId =
  typeof HYBRID_FOCUSED_FIXTURE_IDS[number];
export type HybridFocusedRound = typeof HYBRID_FOCUSED_ROUNDS[number];

export type HybridObservationUsableStatus =
  | "clarify"
  | "unavailable"
  | "usable";

export type HybridObservationFailureCode =
  | "candidate_decision_failure"
  | "candidate_invalid_dag"
  | "candidate_invalid_provenance"
  | "candidate_invalid_structure"
  | "candidate_resource_failure"
  | "none"
  | "query_dispatch_unavailable"
  | "residual_forbidden_intent"
  | "residual_provider_failure"
  | "residual_schema_failure"
  | "residual_timeout"
  | "unexpected_terminal_failure";

export type HybridFocusedFixtureExpectation = Readonly<{
  boundaryResolutionKind: "clarify" | "compound" | "pure_query";
  finalTaskIntents: readonly string[];
}>;

export type HybridFocusedFixture = Readonly<{
  expectation: HybridFocusedFixtureExpectation;
  fixtureId: HybridFocusedFixtureId;
  message: string;
}>;

const focusedFixture = (
  fixtureId: HybridFocusedFixtureId,
): HybridFocusedFixture => {
  const fixture = L3B_EVALUATION_FIXTURES.find(
    (candidate) => candidate.id === fixtureId,
  );
  if (!fixture) {
    throw new Error(`Missing frozen Hybrid fixture: ${fixtureId}`);
  }
  const boundaryResolutionKind =
    fixture.expected.intents.length === 1
    && fixture.expected.intents[0] === "clarify"
      ? "clarify"
      : fixture.expected.mode === "compound"
        ? "compound"
        : "pure_query";
  return Object.freeze({
    expectation: Object.freeze({
      boundaryResolutionKind,
      finalTaskIntents: Object.freeze([...fixture.expected.intents]),
    }),
    fixtureId,
    message: fixture.message,
  });
};

export const HYBRID_FOCUSED_FIXTURES: readonly HybridFocusedFixture[] =
  Object.freeze(HYBRID_FOCUSED_FIXTURE_IDS.map(focusedFixture));

export type HybridLiveObservation = Readonly<{
  answerLogicalCalls: number;
  answerProviderAttempts: number;
  boundaryResolutionKind:
    | "clarify"
    | "compound"
    | "not_applicable"
    | "pure_query";
  businessMutations: number;
  candidateValidationResult: "not_called" | "rejected" | "valid";
  databaseConnection: boolean;
  databaseConnections: number;
  databaseMutation: boolean;
  failureCode: HybridObservationFailureCode;
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
  latencyMs: number;
  mapperReached: boolean;
  observationIndex: number;
  provenanceSource:
    | "explicit_plan_id"
    | "none"
    | "resolved_exact_title"
    | "user_unspecified";
  providerFailure: boolean;
  queryCommentaryLogicalCalls: number;
  queryCommentaryProviderAttempts: number;
  queryDispatcherDecision:
    | "adopted"
    | "ineligible"
    | "legacy"
    | "not_called"
    | "unavailable";
  queryScope: "aggregate" | "none" | "specific";
  rawRetentionViolation: boolean;
  replanLogicalCalls: number;
  replanProviderAttempts: number;
  residualPlannerLogicalCalls: number;
  residualPlannerProviderAttempts: number;
  residualSchemaValid: boolean | null;
  round: HybridFocusedRound;
  semanticMatch: boolean;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  taskExecution: boolean;
  taskExecutions: number;
  timeout: boolean;
  unexpectedDuplicateModelCalls: number;
  usableStatus: HybridObservationUsableStatus;
}>;

const candidateFailureCode = (
  code: HybridCandidateValidationErrorCode,
): HybridObservationFailureCode => {
  switch (code) {
    case "invalid_candidate_structure":
      return "candidate_invalid_structure";
    case "invalid_fixed_task_provenance":
      return "candidate_invalid_provenance";
    case "invalid_dag":
      return "candidate_invalid_dag";
    case "resource_readiness_failure":
      return "candidate_resource_failure";
    case "decision_consistency_failure":
    case "residual_query_intent_forbidden":
      return "candidate_decision_failure";
  }
};

const residualFailureCode = (
  code: ResidualPlannerFailureCode,
): HybridObservationFailureCode => {
  switch (code) {
    case "forbidden_intent":
      return "residual_forbidden_intent";
    case "provider_error":
      return "residual_provider_failure";
    case "schema_failure":
      return "residual_schema_failure";
    case "timeout":
      return "residual_timeout";
  }
};

const equalIntents = (
  actual: readonly string[],
  expected: readonly string[],
): boolean =>
  actual.length === expected.length
  && actual.every((intent, index) => intent === expected[index]);

export const classifyHybridObservation = (input: Readonly<{
  boundaryResolutionKind: HybridLiveObservation["boundaryResolutionKind"];
  candidateFailureCode?: HybridCandidateValidationErrorCode;
  candidateValidationResult:
    HybridLiveObservation["candidateValidationResult"];
  expectation: HybridFocusedFixtureExpectation;
  finalTaskIntents: readonly string[];
  mapperReached: boolean;
  providerFailure: boolean;
  queryDispatcherDecision:
    HybridLiveObservation["queryDispatcherDecision"];
  residualFailureCode?: ResidualPlannerFailureCode;
  terminalFailure: boolean;
  timeout: boolean;
}>): Readonly<{
  failureCode: HybridObservationFailureCode;
  residualSchemaValid: boolean | null;
  semanticMatch: boolean;
  usableStatus: HybridObservationUsableStatus;
}> => {
  const semanticMatch =
    input.boundaryResolutionKind ===
      input.expectation.boundaryResolutionKind
    && equalIntents(
      input.finalTaskIntents,
      input.expectation.finalTaskIntents,
    );
  const residualSchemaValid = input.residualFailureCode === undefined
    ? input.boundaryResolutionKind === "compound"
      ? true
      : null
    : false;

  let failureCode: HybridObservationFailureCode = "none";
  if (input.timeout || input.residualFailureCode === "timeout") {
    failureCode = "residual_timeout";
  } else if (input.residualFailureCode) {
    failureCode = residualFailureCode(input.residualFailureCode);
  } else if (input.providerFailure) {
    failureCode = "residual_provider_failure";
  } else if (
    input.candidateValidationResult === "rejected"
    && input.candidateFailureCode
  ) {
    failureCode = candidateFailureCode(input.candidateFailureCode);
  } else if (
    input.expectation.boundaryResolutionKind === "pure_query"
    && input.queryDispatcherDecision !== "adopted"
  ) {
    failureCode = "query_dispatch_unavailable";
  } else if (
    input.terminalFailure
    || !semanticMatch
    || (
      input.expectation.boundaryResolutionKind === "compound"
      && (
        input.candidateValidationResult !== "valid"
        || !input.mapperReached
      )
    )
  ) {
    failureCode = "unexpected_terminal_failure";
  }

  if (
    failureCode === "none"
    && semanticMatch
    && input.expectation.boundaryResolutionKind === "clarify"
  ) {
    return Object.freeze({
      failureCode,
      residualSchemaValid,
      semanticMatch,
      usableStatus: "clarify" as const,
    });
  }

  return Object.freeze({
    failureCode,
    residualSchemaValid,
    semanticMatch,
    usableStatus:
      failureCode === "none" && semanticMatch
        ? "usable" as const
        : "unavailable" as const,
  });
};

export type HybridFocusedGateBudget = Readonly<{
  actualLogicalCalls: number;
  actualProviderAttempts: number;
  authorizedLogicalCallBudget: number;
  authorizedProviderAttemptBudget: number;
  maxAttemptsPerLogicalCall: number;
  unusedAttempts: number;
}>;

const authorizedResidualLogicalCalls = (): number =>
  HYBRID_FOCUSED_ROUNDS.length
  * HYBRID_FOCUSED_FIXTURES.filter(
    (fixture) =>
      fixture.expectation.boundaryResolutionKind === "compound",
  ).length;

export const calculateHybridFocusedGateBudget = (
  observations: readonly HybridLiveObservation[],
): HybridFocusedGateBudget => {
  const authorizedLogicalCallBudget = authorizedResidualLogicalCalls();
  const maxAttemptsPerLogicalCall =
    (RESIDUAL_PLANNER_RETRY_POLICY.maxSchemaRetries + 1)
    * (RESIDUAL_PLANNER_RETRY_POLICY.maxTransportRetries + 1);
  const authorizedProviderAttemptBudget =
    authorizedLogicalCallBudget * maxAttemptsPerLogicalCall;
  const actualLogicalCalls = observations.reduce(
    (total, observation) =>
      total + observation.residualPlannerLogicalCalls,
    0,
  );
  const actualProviderAttempts = observations.reduce(
    (total, observation) =>
      total + observation.residualPlannerProviderAttempts,
    0,
  );
  return Object.freeze({
    actualLogicalCalls,
    actualProviderAttempts,
    authorizedLogicalCallBudget,
    authorizedProviderAttemptBudget,
    maxAttemptsPerLogicalCall,
    unusedAttempts: Math.max(
      0,
      authorizedProviderAttemptBudget - actualProviderAttempts,
    ),
  });
};

export type HybridFocusedGateSummary = Readonly<{
  acceptableFinalResults: number;
  answerLogicalCalls: number;
  databaseConnections: number;
  databaseMutations: number;
  expectedClarifies: number;
  expectedObservations: 12;
  failedGates: readonly string[];
  fullOrchestratorLogicalCalls: number;
  latencyP50Ms: number | null;
  latencyUpperTailMs: number | null;
  observations: number;
  passed: boolean;
  providerAttempts: number;
  providerFailures: number;
  queryCommentaryLogicalCalls: number;
  rawRetentionViolations: number;
  replanLogicalCalls: number;
  residualPlannerLogicalCalls: number;
  residualProviderObservations: number;
  semanticMatches: number;
  specialistLogicalCalls: number;
  strictResidualSchemaValid: number;
  taskExecutions: number;
  timeouts: number;
  unexpectedDuplicateModelCalls: number;
  usablePlans: number;
  usableResults: number;
}>;

const sum = (
  observations: readonly HybridLiveObservation[],
  field:
    | "answerLogicalCalls"
    | "answerProviderAttempts"
    | "businessMutations"
    | "databaseConnections"
    | "fullOrchestratorLogicalCalls"
    | "fullOrchestratorProviderAttempts"
    | "queryCommentaryLogicalCalls"
    | "queryCommentaryProviderAttempts"
    | "replanLogicalCalls"
    | "replanProviderAttempts"
    | "residualPlannerLogicalCalls"
    | "residualPlannerProviderAttempts"
    | "specialistLogicalCalls"
    | "specialistProviderAttempts"
    | "taskExecutions"
    | "unexpectedDuplicateModelCalls",
): number => observations.reduce(
  (total, observation) => total + observation[field],
  0,
);

const percentile = (
  values: readonly number[],
  quantile: number,
): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[index] ?? null;
};

const expectedClarifies = (): number =>
  HYBRID_FOCUSED_ROUNDS.length
  * HYBRID_FOCUSED_FIXTURES.filter(
    (fixture) =>
      fixture.expectation.boundaryResolutionKind === "clarify",
  ).length;

export const aggregateHybridFocusedGate = (
  observations: readonly HybridLiveObservation[],
): HybridFocusedGateSummary => {
  const expectedObservations = 12 as const;
  const semanticMatches = observations.filter(
    (observation) => observation.semanticMatch,
  ).length;
  const usablePlans = observations.filter(
    (observation) => observation.usableStatus === "usable",
  ).length;
  const acceptableFinalResults = observations.filter(
    (observation) =>
      observation.usableStatus === "usable"
      || observation.usableStatus === "clarify",
  ).length;
  const residualProviderObservations = observations.filter(
    (observation) => observation.residualPlannerLogicalCalls > 0,
  ).length;
  const strictResidualSchemaValid = observations.filter(
    (observation) => observation.residualSchemaValid === true,
  ).length;
  const providerFailures = observations.filter(
    (observation) => observation.providerFailure,
  ).length;
  const timeouts = observations.filter(
    (observation) => observation.timeout,
  ).length;
  const providerAttempts =
    sum(observations, "fullOrchestratorProviderAttempts")
    + sum(observations, "residualPlannerProviderAttempts")
    + sum(observations, "queryCommentaryProviderAttempts")
    + sum(observations, "answerProviderAttempts")
    + sum(observations, "specialistProviderAttempts")
    + sum(observations, "replanProviderAttempts");
  const budget = calculateHybridFocusedGateBudget(observations);
  const failedGates: string[] = [];
  const uniqueIndexes = new Set(
    observations.map((observation) => observation.observationIndex),
  );
  const observationSequenceValid = observations.every(
    (observation, index) =>
      observation.observationIndex === index + 1
      && observation.round ===
        (Math.floor(index / HYBRID_FOCUSED_FIXTURE_IDS.length) + 1),
  );

  if (
    observations.length !== expectedObservations
    || uniqueIndexes.size !== expectedObservations
    || !observationSequenceValid
  ) {
    failedGates.push("observation_contract");
  }
  if (semanticMatches !== expectedObservations) {
    failedGates.push("semantic_matches");
  }
  if (acceptableFinalResults !== expectedObservations) {
    failedGates.push("acceptable_final_results");
  }
  if (
    residualProviderObservations !==
      budget.authorizedLogicalCallBudget
    || strictResidualSchemaValid !== residualProviderObservations
  ) {
    failedGates.push("strict_residual_schema");
  }
  if (providerFailures > 0) failedGates.push("provider_failures");
  if (timeouts > 0) failedGates.push("timeouts");
  if (
    budget.actualLogicalCalls !== budget.authorizedLogicalCallBudget
    || budget.actualProviderAttempts >
      budget.authorizedProviderAttemptBudget
  ) {
    failedGates.push("provider_budget");
  }

  const fullOrchestratorLogicalCalls = sum(
    observations,
    "fullOrchestratorLogicalCalls",
  );
  const queryCommentaryLogicalCalls = sum(
    observations,
    "queryCommentaryLogicalCalls",
  );
  const answerLogicalCalls = sum(observations, "answerLogicalCalls");
  const specialistLogicalCalls = sum(
    observations,
    "specialistLogicalCalls",
  );
  const replanLogicalCalls = sum(observations, "replanLogicalCalls");
  const unexpectedRoleProviderAttempts =
    sum(observations, "fullOrchestratorProviderAttempts")
    + sum(observations, "queryCommentaryProviderAttempts")
    + sum(observations, "answerProviderAttempts")
    + sum(observations, "specialistProviderAttempts")
    + sum(observations, "replanProviderAttempts");
  if (
    fullOrchestratorLogicalCalls > 0
    || queryCommentaryLogicalCalls > 0
    || answerLogicalCalls > 0
    || specialistLogicalCalls > 0
    || replanLogicalCalls > 0
    || unexpectedRoleProviderAttempts > 0
  ) {
    failedGates.push("unexpected_model_roles");
  }

  const unexpectedDuplicateModelCalls = sum(
    observations,
    "unexpectedDuplicateModelCalls",
  );
  if (unexpectedDuplicateModelCalls > 0) {
    failedGates.push("duplicate_model_calls");
  }
  const taskExecutions = sum(observations, "taskExecutions");
  const databaseConnections = sum(observations, "databaseConnections");
  const databaseMutations = sum(observations, "businessMutations");
  const rawRetentionViolations = observations.filter(
    (observation) => observation.rawRetentionViolation,
  ).length;
  if (taskExecutions > 0) failedGates.push("task_executions");
  if (databaseConnections > 0) failedGates.push("database_connections");
  if (databaseMutations > 0) failedGates.push("database_mutations");
  if (rawRetentionViolations > 0) {
    failedGates.push("raw_retention");
  }

  return Object.freeze({
    acceptableFinalResults,
    answerLogicalCalls,
    databaseConnections,
    databaseMutations,
    expectedClarifies: expectedClarifies(),
    expectedObservations,
    failedGates: Object.freeze(failedGates),
    fullOrchestratorLogicalCalls,
    latencyP50Ms: percentile(
      observations.map((observation) => observation.latencyMs),
      0.5,
    ),
    latencyUpperTailMs: percentile(
      observations.map((observation) => observation.latencyMs),
      0.95,
    ),
    observations: observations.length,
    passed: failedGates.length === 0,
    providerAttempts,
    providerFailures,
    queryCommentaryLogicalCalls,
    rawRetentionViolations,
    replanLogicalCalls,
    residualPlannerLogicalCalls: sum(
      observations,
      "residualPlannerLogicalCalls",
    ),
    residualProviderObservations,
    semanticMatches,
    specialistLogicalCalls,
    strictResidualSchemaValid,
    taskExecutions,
    timeouts,
    unexpectedDuplicateModelCalls,
    usablePlans,
    usableResults: usablePlans,
  });
};
