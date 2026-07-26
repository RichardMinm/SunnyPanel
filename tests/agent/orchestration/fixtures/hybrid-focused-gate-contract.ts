import type { OrchestratorTask } from "../../../../src/lib/agent/llm/schemas/orchestrator-output";
import type { AgentPromptContext } from "../../../../src/lib/agent/prompts";

export type FocusedFixtureId = "cmp-4" | "inj-2" | "qry-1" | "qry-4";
export type FocusedRound = 1 | 2 | 3;

export type FocusedObservation = Readonly<{
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
  failureCode:
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
  residualRejectionReason:
    | "consultation_write_bridge"
    | "dag_invalid"
    | "family_forbidden"
    | "intent_not_in_policy"
    | "resource_invalid"
    | null;
  residualSchemaValid: boolean | null;
  round: FocusedRound;
  semanticMatch: boolean;
  specialistLogicalCalls: number;
  specialistProviderAttempts: number;
  taskExecution: boolean;
  taskExecutions: number;
  timeout: boolean;
  unexpectedDuplicateModelCalls: number;
  usableStatus: "clarify" | "unavailable" | "usable";
}>;

export type FocusedExpectation = Readonly<{
  boundaryResolutionKind: "clarify" | "compound" | "pure_query";
  finalTaskIntents: readonly string[];
}>;

export type FocusedRunnerCase = Readonly<{
  expectation: FocusedExpectation;
  fixtureId: FocusedFixtureId;
  message: string;
  observationIndex: number;
  queryCommentaryAdapter: () => Promise<Readonly<{
    latencyMs: 0;
    modelCalls: 0;
    reason: "provider_error";
    status: "omitted";
    ttftMs: null;
  }>>;
  round: FocusedRound;
}>;

export type FocusedGateBudget = Readonly<{
  actualLogicalCalls: number;
  actualProviderAttempts: number;
  authorizedLogicalCallBudget: number;
  authorizedProviderAttemptBudget: number;
  maxAttemptsPerLogicalCall: number;
  unusedAttempts: number;
}>;

export type FocusedGateSummary = Readonly<{
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

export type FocusedGatePreflight = Readonly<{
  authorizedLogicalCallBudget: 3;
  authorizedProviderAttemptBudget: number;
  baseURLHost: string;
  commentaryMode: "omitted";
  evaluationConfigHash: string;
  fixtureSnapshotHash: string;
  head: string;
  maxAttemptsPerLogicalCall: number;
  model: string;
  observations: 12;
  outputBudget: number;
  residualPromptHash: string;
  residualSchemaHash: string;
  schemaRetries: number;
  temperature: number;
  timeoutMs: number;
  transportRetries: number;
}>;

export type FocusedGatePreflightErrorCode =
  | "CMP4_RESIDUAL_INPUT_INVALID"
  | "EVALUATION_CONFIG_HASH_MISMATCH"
  | "EVALUATION_CONFIG_INVALID"
  | "FIXTURE_SNAPSHOT_HASH_MISMATCH"
  | "FOCUSED_FIXTURE_SET_INVALID"
  | "HYBRID_FOCUSED_GATE_RETIRED"
  | "OBSERVATION_CONTRACT_MISMATCH"
  | "QUERY_COMMENTARY_MODE_MISMATCH"
  | "RESIDUAL_BUDGET_CONFIG_MISMATCH"
  | "RESIDUAL_PROMPT_HASH_MISMATCH"
  | "RESIDUAL_SCHEMA_HASH_MISMATCH";

export type FocusedGatePreflightModule = Readonly<{
  HYBRID_FOCUSED_GATE_FROZEN_HASHES: Readonly<{
    evaluationConfigHash: string;
    fixtureSnapshotHash: string;
    residualPromptHash: string;
    residualSchemaHash: string;
  }>;
  assertHybridFocusedGatePreflight: (
    preflight: FocusedGatePreflight,
  ) => void;
  buildHybridFocusedGatePreflight: (input: Readonly<{
    fixtures?: readonly Readonly<{
      context: AgentPromptContext;
      expected: Readonly<{
        intents: readonly string[];
        mode: "compound" | "single";
        safetyClass: "clarify" | "read" | "write_candidate";
      }>;
      id: string;
      injection: boolean;
      message: string;
      tag: string;
    }>[];
    head: string;
  }>) => FocusedGatePreflight;
  hashHybridFocusedFixtureSnapshot: (
    fixtures?: readonly Readonly<{
      context: AgentPromptContext;
      expected: Readonly<{
        intents: readonly string[];
        mode: "compound" | "single";
        safetyClass: "clarify" | "read" | "write_candidate";
      }>;
      id: string;
      injection: boolean;
      message: string;
      tag: string;
    }>[],
  ) => string;
}>;

export type FocusedGateModule = Readonly<{
  aggregateHybridFocusedGate: (
    observations: readonly FocusedObservation[],
  ) => FocusedGateSummary;
  calculateHybridFocusedGateBudget: (
    observations: readonly FocusedObservation[],
  ) => FocusedGateBudget;
  classifyHybridObservation: (input: Readonly<{
    boundaryResolutionKind: FocusedObservation["boundaryResolutionKind"];
    candidateFailureCode?:
      | "decision_consistency_failure"
      | "invalid_candidate_structure"
      | "invalid_dag"
      | "invalid_fixed_task_provenance"
      | "residual_query_intent_forbidden"
      | "resource_readiness_failure";
    candidateValidationResult:
      FocusedObservation["candidateValidationResult"];
    expectation: FocusedExpectation;
    finalTaskIntents: readonly string[];
    mapperReached: boolean;
    providerFailure: boolean;
    queryDispatcherDecision:
      FocusedObservation["queryDispatcherDecision"];
    residualFailureCode?:
      | "forbidden_intent"
      | "provider_error"
      | "schema_failure"
      | "timeout";
    terminalFailure: boolean;
    timeout: boolean;
  }>) => Readonly<{
    failureCode: FocusedObservation["failureCode"];
    residualSchemaValid: boolean | null;
    semanticMatch: boolean;
    usableStatus: FocusedObservation["usableStatus"];
  }>;
}>;

export type FocusedGateRunnerModule = Readonly<{
  HYBRID_QUERY_COMMENTARY_OMISSION_NOTE: string;
  runHybridFocusedGate: (input: Readonly<{
    evaluate: (input: FocusedRunnerCase) => Promise<FocusedObservation>;
    preflight: FocusedGatePreflight;
  }>) => Promise<readonly FocusedObservation[]>;
}>;

export type FocusedGateReportModule = Readonly<{
  HYBRID_FOCUSED_GATE_REPORT_PATH: string;
  assertHybridFocusedGateReportPath: (path: string) => Promise<string>;
  assertHybridFocusedGateReportReady: () => Promise<string>;
  scanHybridFocusedGateReport: (
    report: unknown,
    sensitiveValues?: readonly unknown[],
  ) => Readonly<{
    rawRetentionViolation: boolean;
    violationCodes: readonly string[];
  }>;
  writeHybridFocusedGateReport: (input: Readonly<{
    report: unknown;
    sensitiveValues?: readonly unknown[];
  }>) => Promise<Readonly<{
    bytes: number;
    path: string;
  }>>;
}>;

export type ProductionEvaluationModule = Readonly<{
  evaluateHybridProductionCase: (input: Readonly<{
    authenticatedActor: Readonly<{
      collection: "users";
      id: number;
      isAdmin: boolean;
    }>;
    clock?: () => number;
    context: AgentPromptContext;
    expectation: FocusedExpectation;
    fixtureId: FocusedFixtureId;
    message: string;
    observationIndex: number;
    queryAdoption: "admin";
    queryCommentaryAdapter: () => Promise<Readonly<{
      latencyMs: 0;
      modelCalls: 0;
      reason: "provider_error";
      status: "omitted";
      ttftMs: null;
    }>>;
    queryRuntime: "langchain";
    residualInvoke: (
      input: unknown,
      attempt: number,
    ) => Promise<readonly OrchestratorTask[]>;
    round: FocusedRound;
  }>) => Promise<FocusedObservation>;
}>;

export const focusedContext = (
  secret = "考研数学复习计划",
): AgentPromptContext => ({
  checklists: [],
  now: "2026-07-17T12:00:00.000+08:00",
  pendingAction: null,
  plans: [{
    id: 101,
    priority: "medium",
    state: "active",
    title: secret,
  }],
});

export const focusedExpectations: Record<
  FocusedFixtureId,
  FocusedExpectation
> = {
  "cmp-4": {
    boundaryResolutionKind: "compound",
    finalTaskIntents: ["query_progress", "compose_checklist"],
  },
  "inj-2": {
    boundaryResolutionKind: "pure_query",
    finalTaskIntents: ["query_progress"],
  },
  "qry-1": {
    boundaryResolutionKind: "pure_query",
    finalTaskIntents: ["query_progress"],
  },
  "qry-4": {
    boundaryResolutionKind: "clarify",
    finalTaskIntents: ["clarify"],
  },
};

export const omitFocusedCommentary = async () => ({
  latencyMs: 0 as const,
  modelCalls: 0 as const,
  reason: "provider_error" as const,
  status: "omitted" as const,
  ttftMs: null,
});

export const residualWriteTask = (): OrchestratorTask => ({
  agentRole: "plan",
  args: { title: "未完成任务" },
  dependsOn: [],
  id: "draft",
  intent: "compose_checklist",
  label: "整理未完成任务",
});

export const baseObservation = (
  overrides: Partial<FocusedObservation> = {},
): FocusedObservation => ({
  answerLogicalCalls: 0,
  answerProviderAttempts: 0,
  boundaryResolutionKind: "pure_query",
  businessMutations: 0,
  candidateValidationResult: "not_called",
  databaseConnection: false,
  databaseConnections: 0,
  databaseMutation: false,
  failureCode: "none",
  finalDependencies: [],
  finalTaskIntents: ["query_progress"],
  fixedQueryIntent: "query_progress",
  fixedTaskOwnership: "deterministic_query_boundary",
  fixtureId: "qry-1",
  fullOrchestratorLogicalCalls: 0,
  fullOrchestratorProviderAttempts: 0,
  latencyMs: 10,
  mapperReached: false,
  observationIndex: 1,
  provenanceSource: "user_unspecified",
  providerFailure: false,
  queryCommentaryLogicalCalls: 0,
  queryCommentaryProviderAttempts: 0,
  queryDispatcherDecision: "adopted",
  queryScope: "aggregate",
  rawRetentionViolation: false,
  replanLogicalCalls: 0,
  replanProviderAttempts: 0,
  residualPlannerLogicalCalls: 0,
  residualPlannerProviderAttempts: 0,
  residualRejectionReason: null,
  residualSchemaValid: null,
  round: 1,
  semanticMatch: true,
  specialistLogicalCalls: 0,
  specialistProviderAttempts: 0,
  taskExecution: false,
  taskExecutions: 0,
  timeout: false,
  unexpectedDuplicateModelCalls: 0,
  usableStatus: "usable",
  ...overrides,
});
