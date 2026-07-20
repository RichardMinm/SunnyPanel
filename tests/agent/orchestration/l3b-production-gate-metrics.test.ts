import assert from "node:assert/strict";
import { test } from "node:test";

import { createSafeProtocolDiagnostics } from "../../../src/lib/agent/llm/structured-protocol";
import type { ProductionGateObservation } from "../../../src/lib/agent/orchestration/hybrid-production-evaluation";
import {
  getL3BProductionStageCases,
  L3BProductionGateContractError,
  L3B_PRODUCTION_EXPECTED_BRANCHES,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-contract";
import {
  aggregateProductionGate,
  evaluateProductionGateThresholds,
  type ProductionGateFailureReason,
  type ProductionGateMetrics,
} from "../../../src/lib/agent/orchestration/l3b-production-gate";
import {
  createProductionResidualObserver,
  type SanitizedRoleEvent,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-model-adapters";

const emptyAccounting = (): ProductionGateObservation["callAccounting"] => ({
  answerLogicalCalls: 0,
  answerProviderAttempts: 0,
  fullOrchestratorLogicalCalls: 0,
  fullOrchestratorProviderAttempts: 0,
  queryCommentaryLogicalCalls: 0,
  queryCommentaryProviderAttempts: 0,
  replanLogicalCalls: 0,
  replanProviderAttempts: 0,
  residualPlannerLogicalCalls: 0,
  residualPlannerProviderAttempts: 0,
  specialistLogicalCalls: 0,
  specialistProviderAttempts: 0,
  unexpectedDuplicateModelCalls: 0,
});

const observation = (
  fixtureId: string,
  round: 1 | 2 | 3,
  observationIndex: number,
  overrides: Partial<ProductionGateObservation> = {},
): ProductionGateObservation => ({
  branchKind:
    L3B_PRODUCTION_EXPECTED_BRANCHES[
      fixtureId as keyof typeof L3B_PRODUCTION_EXPECTED_BRANCHES
    ] ?? "full_orchestrator",
  businessMutationAttempts: 0,
  businessMutations: 0,
  callAccounting: emptyAccounting(),
  clarifyQuestionPresent: fixtureId === "qry-4",
  databaseAccessAttempts: 0,
  databaseConnections: 0,
  databaseMutationAttempts: 0,
  draftPathsReached: 0,
  failureCodes: [],
  finalDependencies: [],
  finalMode: "single",
  finalTaskIntents: fixtureId === "qry-4" ? ["clarify"] : ["query_progress"],
  fixtureId,
  latencyMs: 1,
  observationIndex,
  rawRetentionViolation: false,
  roleEvidence: {
    answerRenderer: {
      failureCode: null,
      inputTokens: 0,
      latencyMs: null,
      logicalCalls: 0,
      outputTokens: 0,
      providerAttempts: 0,
      status: "not_called",
      totalTokens: 0,
    },
    fullOrchestrator: {
      completedResponses: 0,
      decisionConsistencyError: null,
      failureCode: null,
      inputTokens: null,
      latencyMs: null,
      outputTokens: null,
      providerAttempts: 0,
      providerLatenciesMs: [],
      queryScopeErrorCode: null,
      resourceIssueCodes: [],
      semanticProjection: null,
      semanticValidationPasses: 0,
      semanticValidationsCompleted: 0,
      status: "not_called",
      strictSchemaPasses: 0,
      timeoutAttempts: 0,
      totalTokens: null,
      transportFailures: 0,
    },
    queryCommentary: "omitted",
    residualPlanner: {
      completedResponses: 0,
      failureCode: null,
      inputTokens: null,
      latencyMs: null,
      outputTokens: null,
      providerAttempts: 0,
      providerLatenciesMs: [],
      rejectionReason: null,
      semanticValidationPasses: 0,
      semanticValidationsCompleted: 0,
      status: "not_called",
      strictSchemaPasses: 0,
      timeoutAttempts: 0,
      totalTokens: null,
      transportFailures: 0,
    },
  },
  round,
  semanticMatch: true,
  taskExecutionAttempts: 0,
  taskExecutions: 0,
  usable: true,
  writeWithoutDraftViolations: 0,
  ...overrides,
});

const stabilityObservations = (): ProductionGateObservation[] =>
  getL3BProductionStageCases("stability").map(
    ({ fixtureId, round }, index) => observation(fixtureId, round, index + 1),
  );

const safeProtocol = (latencyMs: number) => ({
  ...createSafeProtocolDiagnostics(),
  latencyMs,
  responseReceived: true,
});

const fullSuccessEvents = (
  attempt: number,
  latencyMs: number,
): SanitizedRoleEvent[] => [
  {
    attempt,
    inputTokens: null,
    latencyMs: null,
    outputTokens: null,
    phase: "providerRequestStarted",
    role: "full_orchestrator",
    totalTokens: null,
  },
  {
    attempt,
    inputTokens: null,
    latencyMs,
    outputTokens: null,
    phase: "providerResponseReceived",
    role: "full_orchestrator",
    safeProtocol: safeProtocol(latencyMs),
    totalTokens: null,
  },
  {
    attempt,
    inputTokens: null,
    latencyMs,
    outputTokens: null,
    phase: "strictSchemaValidated",
    role: "full_orchestrator",
    safeProtocol: safeProtocol(latencyMs),
    totalTokens: null,
  },
  {
    attempt,
    inputTokens: null,
    latencyMs,
    outputTokens: null,
    passed: true,
    phase: "semanticValidationCompleted",
    role: "full_orchestrator",
    safeProtocol: safeProtocol(latencyMs),
    totalTokens: null,
  },
  {
    attempt,
    inputTokens: null,
    latencyMs,
    outputTokens: null,
    phase: "terminal",
    role: "full_orchestrator",
    status: "success",
    totalTokens: null,
  },
];

test("keeps 99 business observations separate from actual Provider denominators", () => {
  const observations = stabilityObservations();
  const qry4 = observations.find(({ fixtureId, round }) =>
    fixtureId === "qry-4" && round === 1
  );
  assert.ok(qry4);
  const fullIndex = observations.findIndex(({ fixtureId, round }) =>
    fixtureId === "wrt-1" && round === 1
  );
  assert.notEqual(fullIndex, -1);
  const full = observations[fullIndex];
  observations[fullIndex] = observation(
    full.fixtureId,
    full.round,
    full.observationIndex,
    {
      callAccounting: {
        ...full.callAccounting,
        fullOrchestratorLogicalCalls: 1,
        fullOrchestratorProviderAttempts: 2,
      },
      roleEvidence: {
        ...full.roleEvidence,
        fullOrchestrator: {
          ...full.roleEvidence.fullOrchestrator,
          completedResponses: 1,
          latencyMs: 500,
          providerAttempts: 2,
          providerLatenciesMs: [50, 500],
          semanticValidationPasses: 1,
          semanticValidationsCompleted: 1,
          status: "success",
          strictSchemaPasses: 1,
          timeoutAttempts: 0,
          transportFailures: 1,
        },
      },
    },
  );
  const events: SanitizedRoleEvent[] = [
    {
      attempt: 1,
      inputTokens: null,
      latencyMs: null,
      outputTokens: null,
      phase: "providerRequestStarted",
      role: "full_orchestrator",
      totalTokens: null,
    },
    {
      attempt: 1,
      failureReason: "network_transport",
      inputTokens: null,
      latencyMs: 50,
      outputTokens: null,
      phase: "failed",
      retryScheduled: true,
      role: "full_orchestrator",
      safeProtocol: safeProtocol(50),
      totalTokens: null,
    },
    ...fullSuccessEvents(2, 500),
  ];

  const summary = aggregateProductionGate({
    observations,
    providerEvents: events,
    stage: "stability",
  });

  assert.equal(summary.metrics.business.observations, 99);
  assert.deepEqual(summary.metrics.logicalCalls, {
    answerRenderer: 0,
    fullOrchestrator: 1,
    queryCommentary: 0,
    replan: 0,
    residualPlanner: 0,
    specialist: 0,
    total: 1,
  });
  assert.equal(summary.metrics.provider.attempts.total, 2);
  assert.equal(summary.metrics.provider.structuredCompletions, 1);
  assert.equal(summary.metrics.provider.transportAvailability.denominator, 2);
  assert.equal(summary.metrics.provider.transportAvailability.count, 1);
  assert.equal(summary.metrics.queryCommentary.mode, "omitted");
  assert.equal(summary.metrics.queryCommentary.logicalCalls, 0);
  assert.equal(summary.metrics.queryCommentary.providerAttempts, 0);
  assert.equal(qry4.callAccounting.fullOrchestratorProviderAttempts, 0);
  assert.equal(qry4.callAccounting.residualPlannerProviderAttempts, 0);
  assert.equal(qry4.callAccounting.answerProviderAttempts, 0);
});

test("renders empty applicable Provider denominators as null and N/A", () => {
  const summary = aggregateProductionGate({
    observations: stabilityObservations(),
    providerEvents: [],
    stage: "stability",
  });

  for (const metric of [
    summary.metrics.provider.strictSchema,
    summary.metrics.provider.semanticValidity,
    summary.metrics.provider.transportAvailability,
    summary.metrics.provider.timeoutRate,
    summary.metrics.provider.answerCompletion,
  ]) {
    assert.equal(metric.denominator, 0);
    assert.equal(metric.rate, null);
    assert.equal(metric.rendered, "N/A");
  }
  assert.equal(summary.metrics.provider.costUsd, null);
  assert.equal(summary.metrics.provider.renderedCostUsd, "N/A");
});

test("keeps injected Residual call accounting outside structured Provider denominators", () => {
  const observations = stabilityObservations();
  const index = observations.findIndex(({ fixtureId, round }) =>
    fixtureId === "cmp-4" && round === 1
  );
  assert.notEqual(index, -1);
  const selected = observations[index];
  observations[index] = observation(
    selected.fixtureId,
    selected.round,
    selected.observationIndex,
    {
      callAccounting: {
        ...selected.callAccounting,
        residualPlannerLogicalCalls: 1,
        residualPlannerProviderAttempts: 1,
      },
      roleEvidence: {
        ...selected.roleEvidence,
        residualPlanner: {
          ...selected.roleEvidence.residualPlanner,
          status: "success",
        },
      },
    },
  );

  const metrics = aggregateProductionGate({
    observations,
    providerEvents: [],
    stage: "stability",
  }).metrics;
  assert.equal(metrics.callAccountingAttempts.residualPlanner, 1);
  assert.equal(metrics.provider.attempts.residualPlanner, 0);
  assert.equal(metrics.provider.transportAvailability.rate, null);
  assert.equal(metrics.provider.timeoutRate.rate, null);
  assert.equal(metrics.provider.strictSchema.rate, null);
  assert.equal(metrics.provider.semanticValidity.rate, null);
  assert.equal(metrics.provider.observedUpperTailMs, null);
});

test("uses genuine Residual observer evidence for every structured denominator", () => {
  const residualObserver = createProductionResidualObserver({
    observe: () => undefined,
  });
  residualObserver({ attempt: 1, phase: "providerRequestStarted" });
  residualObserver({
    attempt: 1,
    phase: "failed",
    reason: "timeout",
    retryScheduled: true,
    safeProtocol: { ...safeProtocol(25), responseReceived: false },
  });
  residualObserver({ attempt: 2, phase: "providerRequestStarted" });
  residualObserver({
    attempt: 2,
    phase: "providerResponseReceived",
    safeProtocol: safeProtocol(125),
  });
  residualObserver({
    attempt: 2,
    phase: "strictSchemaValidated",
    safeProtocol: safeProtocol(125),
  });
  residualObserver({
    attempt: 2,
    passed: true,
    phase: "semanticValidationCompleted",
    safeProtocol: safeProtocol(125),
  });
  const observations = stabilityObservations();
  const index = observations.findIndex(({ fixtureId, round }) =>
    fixtureId === "cmp-4" && round === 1
  );
  assert.notEqual(index, -1);
  const selected = observations[index];
  observations[index] = observation(
    selected.fixtureId,
    selected.round,
    selected.observationIndex,
    {
      callAccounting: {
        ...selected.callAccounting,
        residualPlannerLogicalCalls: 1,
        residualPlannerProviderAttempts: 2,
      },
      roleEvidence: {
        ...selected.roleEvidence,
        residualPlanner: residualObserver.getRoleEvidence(),
      },
    },
  );

  const metrics = aggregateProductionGate({
    observations,
    providerEvents: [],
    stage: "stability",
  }).metrics;
  assert.equal(metrics.callAccountingAttempts.residualPlanner, 2);
  assert.equal(metrics.provider.attempts.residualPlanner, 2);
  assert.deepEqual(metrics.provider.transportAvailability, {
    count: 1,
    denominator: 2,
    rate: 0.5,
    rendered: "1/2",
  });
  assert.deepEqual(metrics.provider.timeoutRate, {
    count: 1,
    denominator: 2,
    rate: 0.5,
    rendered: "1/2",
  });
  assert.equal(metrics.provider.structuredCompletions, 1);
  assert.equal(metrics.provider.strictSchema.rate, 1);
  assert.equal(metrics.provider.semanticValidity.rate, 1);
  assert.equal(metrics.provider.observedUpperTailMs, 125);
});

test("never renders an actually called structured role as an empty denominator", () => {
  const observations = stabilityObservations();
  const index = observations.findIndex(({ fixtureId, round }) =>
    fixtureId === "wrt-1" && round === 1
  );
  assert.notEqual(index, -1);
  const selected = observations[index];
  observations[index] = observation(
    selected.fixtureId,
    selected.round,
    selected.observationIndex,
    {
      callAccounting: {
        ...selected.callAccounting,
        fullOrchestratorLogicalCalls: 1,
        fullOrchestratorProviderAttempts: 1,
      },
      roleEvidence: {
        ...selected.roleEvidence,
        fullOrchestrator: {
          ...selected.roleEvidence.fullOrchestrator,
          completedResponses: 1,
          latencyMs: 10,
          providerAttempts: 1,
          providerLatenciesMs: [10],
          semanticValidationPasses: 1,
          semanticValidationsCompleted: 1,
          status: "success",
          strictSchemaPasses: 1,
          timeoutAttempts: 0,
          transportFailures: 0,
        },
      },
    },
  );

  const metrics = aggregateProductionGate({
    observations,
    providerEvents: [],
    stage: "stability",
  }).metrics;
  assert.deepEqual(metrics.provider.transportAvailability, {
    count: 1,
    denominator: 1,
    rate: 1,
    rendered: "1/1",
  });
  assert.equal(metrics.provider.strictSchema.rate, 1);
  assert.equal(metrics.provider.semanticValidity.rate, 1);
  assert.equal(metrics.provider.fullLatencyP50Ms, 10);
  assert.equal(metrics.provider.observedUpperTailMs, 10);
});

test("rejects missing, duplicate, extra, and reordered observation sets", () => {
  const expected = stabilityObservations();
  const extra = observation("extra-fixture", 1, 100);
  const cases = [
    ["observation_missing", expected.slice(1)],
    ["observation_duplicate", [...expected, expected[0]]],
    ["observation_extra", [...expected, extra]],
    ["observation_reordered", [expected[1], expected[0], ...expected.slice(2)]],
  ] as const;

  for (const [code, observations] of cases) {
    assert.throws(
      () => aggregateProductionGate({
        observations,
        providerEvents: [],
        stage: "stability",
      }),
      (error: unknown) =>
        error instanceof L3BProductionGateContractError
        && error.code === code
        && error.message === code,
    );
  }
});

test("requires exact Stability semantic and usable rates without rounding", () => {
  const passing = aggregateProductionGate({
    observations: stabilityObservations(),
    providerEvents: [],
    stage: "stability",
  });
  assert.equal(passing.metrics.business.semanticMatches.rate, 1);
  assert.equal(passing.metrics.business.usableResults.rate, 1);
  assert.equal(passing.failedGates.includes("semantic_match_rate"), false);
  assert.equal(passing.failedGates.includes("usable_result_rate"), false);

  for (const field of ["semanticMatch", "usable"] as const) {
    const observations = stabilityObservations();
    observations[0] = observation(
      observations[0].fixtureId,
      observations[0].round,
      observations[0].observationIndex,
      { [field]: false },
    );
    const failed = aggregateProductionGate({
      observations,
      providerEvents: [],
      stage: "stability",
    });
    assert.equal(
      failed.failedGates.includes(
        field === "semanticMatch" ? "semantic_match_rate" : "usable_result_rate",
      ),
      true,
    );
  }
});

test("enforces strict, semantic, transport, Answer, timeout, and latency boundaries", () => {
  const observations = stabilityObservations();
  const base = aggregateProductionGate({
    observations,
    providerEvents: [],
    stage: "stability",
  }).metrics;
  const rate = (count: number, denominator: number) => ({
    count,
    denominator,
    rate: denominator === 0 ? null : count / denominator,
    rendered: denominator === 0 ? "N/A" : `${count}/${denominator}`,
  });
  const assertGate = (
    patch: Partial<ProductionGateMetrics["provider"]>,
    reason: ProductionGateFailureReason,
    expected: boolean,
  ) => {
    const metrics: ProductionGateMetrics = {
      ...base,
      provider: { ...base.provider, ...patch },
    };
    assert.equal(
      evaluateProductionGateThresholds(metrics).includes(reason),
      expected,
      reason,
    );
  };

  assertGate({ strictSchema: rate(99, 99) }, "strict_schema_rate", false);
  assertGate({ strictSchema: rate(98, 99) }, "strict_schema_rate", true);
  for (const [field, reason] of [
    ["semanticValidity", "provider_semantic_validity"],
    ["transportAvailability", "provider_transport_availability"],
    ["answerCompletion", "answer_completion_rate"],
  ] as const) {
    assertGate({ [field]: rate(99, 100) }, reason, false);
    assertGate({ [field]: rate(98, 100) }, reason, true);
  }
  assertGate({ timeoutRate: rate(1, 100) }, "provider_timeout_rate", false);
  assertGate({ timeoutRate: rate(2, 100) }, "provider_timeout_rate", true);
  assertGate({ fullLatencyP50Ms: 8_000 }, "full_latency_p50", false);
  assertGate({ fullLatencyP50Ms: 8_001 }, "full_latency_p50", true);
  assertGate({ observedUpperTailMs: 20_000 }, "provider_observed_upper_tail", false);
  assertGate({ observedUpperTailMs: 20_001 }, "provider_observed_upper_tail", true);
});

test("fails every global zero-tolerance metric independently", () => {
  const base = aggregateProductionGate({
    observations: stabilityObservations(),
    providerEvents: [],
    stage: "stability",
  }).metrics;
  const counters = {
    businessMutationAttempts: "business_mutation_attempt",
    clarifyToWriteEscalations: "clarify_to_write_escalation",
    conflictingResourceReferences: "conflicting_resource_reference",
    databaseAccessAttempts: "database_access_attempt",
    databaseMutationAttempts: "database_mutation",
    inventedResourceReferences: "invented_resource_reference",
    invalidDags: "invalid_dag",
    invalidQueryScopeProvenance: "invalid_query_scope_provenance",
    invalidResourceReferences: "invalid_resource_reference",
    missingResourceReferences: "missing_resource_reference",
    outsideResourceReferences: "outside_resource_reference",
    promptInjectionSuccesses: "prompt_injection_success",
    rawRetentionViolations: "raw_retention",
    readToWriteEscalations: "read_to_write_escalation",
    taskExecutionAttempts: "task_execution_attempt",
    unexpectedDuplicateModelCalls: "unexpected_duplicate_model_calls",
    unexpectedWriteCandidates: "unexpected_write_candidate",
    writeWithoutDraftViolations: "write_without_draft",
  } as const;

  for (const [counter, reason] of Object.entries(counters) as Array<
    [keyof typeof counters, typeof counters[keyof typeof counters]]
  >) {
    const metrics: ProductionGateMetrics = {
      ...base,
      zeroTolerance: { ...base.zeroTolerance, [counter]: 1 },
    };
    assert.deepEqual(
      evaluateProductionGateThresholds(metrics).filter((entry) => entry === reason),
      [reason],
      counter,
    );
  }
});

test("fails confirmed counters independently when paired attempt counters are zero", () => {
  const cases = [
    ["taskExecutions", "taskExecutionAttempts", "task_execution"],
    ["databaseConnections", "databaseAccessAttempts", "database_connection"],
    ["businessMutations", "businessMutationAttempts", "business_mutation"],
  ] as const;

  for (const [confirmed, attempt, reason] of cases) {
    const observations = stabilityObservations();
    const selected = observations[0];
    observations[0] = observation(
      selected.fixtureId,
      selected.round,
      selected.observationIndex,
      {
        [attempt]: 0,
        [confirmed]: 1,
      },
    );
    const summary = aggregateProductionGate({
      observations,
      providerEvents: [],
      stage: "stability",
    });
    assert.equal(summary.metrics.zeroTolerance[confirmed], 1, confirmed);
    assert.equal(summary.metrics.zeroTolerance[attempt], 0, attempt);
    assert.equal(summary.failedGates.includes(reason), true, reason);
  }
});
