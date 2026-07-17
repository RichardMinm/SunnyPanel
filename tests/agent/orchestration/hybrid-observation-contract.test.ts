import assert from "node:assert/strict";
import { test } from "node:test";

import {
  focusedContext,
  focusedExpectations,
  omitFocusedCommentary,
  type ProductionEvaluationModule,
} from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

test("production observation includes stable index, scope, provenance, and clock latency", async () => {
  const { evaluateHybridProductionCase } =
    await loadR4AGreenModule<ProductionEvaluationModule>(
      R4A_GREEN_MODULES.productionEvaluation,
      "hybrid_live_observation_contract",
    );
  const ticks = [1_000, 1_037];
  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 7, isAdmin: true },
    clock: () => ticks.shift() ?? assert.fail("clock called too often"),
    context: focusedContext(),
    expectation: focusedExpectations["qry-1"],
    fixtureId: "qry-1",
    message: "看看我的工作计划进度",
    observationIndex: 9,
    queryAdoption: "admin",
    queryCommentaryAdapter: omitFocusedCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query cannot call Residual"),
    round: 3,
  });

  assert.equal(observation.round, 3);
  assert.equal(observation.observationIndex, 9);
  assert.equal(observation.queryScope, "aggregate");
  assert.equal(observation.provenanceSource, "user_unspecified");
  assert.equal(observation.latencyMs, 37);
  assert.equal(observation.failureCode, "none");
  assert.equal(observation.providerFailure, false);
  assert.equal(observation.timeout, false);
  assert.equal(observation.taskExecution, false);
  assert.equal(observation.databaseConnection, false);
  assert.equal(observation.databaseMutation, false);
  assert.equal(observation.rawRetentionViolation, false);
});

test("observation projection retains no raw fixture or actor data", async () => {
  const { evaluateHybridProductionCase } =
    await loadR4AGreenModule<ProductionEvaluationModule>(
      R4A_GREEN_MODULES.productionEvaluation,
      "hybrid_live_observation_retention",
    );
  const title = "R4A_TASK7_SECRET_TITLE";
  const message = "R4A_TASK7_SECRET_REQUEST";
  const observation = await evaluateHybridProductionCase({
    authenticatedActor: { collection: "users", id: 7, isAdmin: true },
    context: focusedContext(title),
    expectation: focusedExpectations["qry-1"],
    fixtureId: "qry-1",
    message,
    observationIndex: 1,
    queryAdoption: "admin",
    queryCommentaryAdapter: omitFocusedCommentary,
    queryRuntime: "langchain",
    residualInvoke: async () => assert.fail("pure Query cannot call Residual"),
    round: 1,
  });

  const serialized = JSON.stringify(observation);
  assert.doesNotMatch(serialized, new RegExp(title));
  assert.doesNotMatch(serialized, new RegExp(message));
  assert.doesNotMatch(serialized, /"actorId"|"planId"|"prompt"|"response"/i);
});
