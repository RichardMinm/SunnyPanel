import assert from "node:assert/strict";
import { test } from "node:test";

import {
  focusedContext,
  focusedExpectations,
  omitFocusedCommentary,
  residualWriteTask,
  type FocusedGateModule,
  type ProductionEvaluationModule,
} from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadEvaluator = () =>
  loadR4AGreenModule<ProductionEvaluationModule>(
    R4A_GREEN_MODULES.productionEvaluation,
    "hybrid_observation_classification",
  );

const cmp4Input = () => ({
  authenticatedActor: {
    collection: "users" as const,
    id: 7,
    isAdmin: true,
  },
  context: focusedContext(),
  expectation: focusedExpectations["cmp-4"],
  fixtureId: "cmp-4" as const,
  message: "检查项目进度，记录未完成的作为新任务",
  observationIndex: 4,
  queryAdoption: "admin" as const,
  queryCommentaryAdapter: omitFocusedCommentary,
  queryRuntime: "langchain" as const,
  round: 1 as const,
});

test("two exhausted Residual transport attempts are unavailable, never usable", async () => {
  const { evaluateHybridProductionCase } = await loadEvaluator();
  const observation = await evaluateHybridProductionCase({
    ...cmp4Input(),
    residualInvoke: async () => {
      throw new Error("synthetic provider failure");
    },
  });

  assert.equal(observation.residualPlannerLogicalCalls, 1);
  assert.equal(observation.residualPlannerProviderAttempts, 2);
  assert.equal(observation.usableStatus, "unavailable");
  assert.equal(observation.failureCode, "residual_provider_failure");
  assert.equal(observation.providerFailure, true);
  assert.equal(observation.timeout, false);
  assert.equal(observation.mapperReached, false);
});

test("typed timeout survives the safe fallback projection", async () => {
  const { evaluateHybridProductionCase } = await loadEvaluator();
  const observation = await evaluateHybridProductionCase({
    ...cmp4Input(),
    residualInvoke: async () => {
      const failure = new Error("synthetic timeout") as Error & {
        code: "MODEL_TIMEOUT";
      };
      failure.code = "MODEL_TIMEOUT";
      throw failure;
    },
  });

  assert.equal(observation.usableStatus, "unavailable");
  assert.equal(observation.failureCode, "residual_timeout");
  assert.equal(observation.providerFailure, false);
  assert.equal(observation.timeout, true);
});

test("Residual schema failure is unavailable and keeps the schema denominator", async () => {
  const { evaluateHybridProductionCase } = await loadEvaluator();
  const observation = await evaluateHybridProductionCase({
    ...cmp4Input(),
    residualInvoke: async () => [],
  });

  assert.equal(observation.usableStatus, "unavailable");
  assert.equal(observation.failureCode, "residual_schema_failure");
  assert.equal(observation.residualSchemaValid, false);
  assert.equal(observation.providerFailure, false);
  assert.equal(observation.timeout, false);
});

test("expected deterministic clarify is distinct from unavailable", async () => {
  const { evaluateHybridProductionCase } = await loadEvaluator();
  const observation = await evaluateHybridProductionCase({
    ...cmp4Input(),
    expectation: focusedExpectations["qry-4"],
    fixtureId: "qry-4",
    message: "检查一下考研数学计划的完成情况",
    observationIndex: 2,
    residualInvoke: async () => assert.fail("clarify cannot call Residual"),
  });

  assert.equal(observation.boundaryResolutionKind, "clarify");
  assert.equal(observation.usableStatus, "clarify");
  assert.equal(observation.failureCode, "none");
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.residualPlannerLogicalCalls, 0);
});

test("successful compound remains usable after Composer, validator, and Mapper", async () => {
  const { evaluateHybridProductionCase } = await loadEvaluator();
  const observation = await evaluateHybridProductionCase({
    ...cmp4Input(),
    residualInvoke: async () => [residualWriteTask()],
  });

  assert.equal(observation.usableStatus, "usable");
  assert.equal(observation.failureCode, "none");
  assert.equal(observation.semanticMatch, true);
  assert.equal(observation.candidateValidationResult, "valid");
  assert.equal(observation.mapperReached, true);
  assert.equal(observation.residualSchemaValid, true);
});

test("candidate rejection codes map to the stable Hybrid observation contract", async () => {
  const { classifyHybridObservation } =
    await loadR4AGreenModule<FocusedGateModule>(
      R4A_GREEN_MODULES.focusedGate,
      "hybrid_candidate_failure_projection",
    );

  const cases = [
    ["invalid_candidate_structure", "candidate_invalid_structure"],
    ["invalid_fixed_task_provenance", "candidate_invalid_provenance"],
    ["decision_consistency_failure", "candidate_decision_failure"],
    ["invalid_dag", "candidate_invalid_dag"],
    ["resource_readiness_failure", "candidate_resource_failure"],
  ] as const;
  for (const [candidateFailureCode, failureCode] of cases) {
    const result = classifyHybridObservation({
      boundaryResolutionKind: "compound",
      candidateFailureCode,
      candidateValidationResult: "rejected",
      expectation: focusedExpectations["cmp-4"],
      finalTaskIntents: [],
      mapperReached: false,
      providerFailure: false,
      queryDispatcherDecision: "not_called",
      terminalFailure: false,
      timeout: false,
    });
    assert.equal(result.usableStatus, "unavailable");
    assert.equal(result.failureCode, failureCode);
  }
});
