import assert from "node:assert/strict";
import { test } from "node:test";

import {
  baseObservation,
  type FocusedGateModule,
  type FocusedObservation,
} from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const passingMatrix = (): FocusedObservation[] => {
  const fixtureIds = ["qry-1", "qry-4", "inj-2", "cmp-4"] as const;
  const observations: FocusedObservation[] = [];
  let index = 0;
  for (const round of [1, 2, 3] as const) {
    for (const fixtureId of fixtureIds) {
      index += 1;
      const isClarify = fixtureId === "qry-4";
      const isCompound = fixtureId === "cmp-4";
      observations.push(baseObservation({
        boundaryResolutionKind: isClarify
          ? "clarify"
          : isCompound
            ? "compound"
            : "pure_query",
        candidateValidationResult: isCompound ? "valid" : "not_called",
        finalTaskIntents: isClarify
          ? ["clarify"]
          : isCompound
            ? ["query_progress", "compose_checklist"]
            : ["query_progress"],
        fixtureId,
        latencyMs: index * 10,
        mapperReached: isCompound,
        observationIndex: index,
        queryDispatcherDecision:
          isClarify || isCompound ? "not_called" : "adopted",
        residualPlannerLogicalCalls: isCompound ? 1 : 0,
        residualPlannerProviderAttempts: isCompound ? 2 : 0,
        residualSchemaValid: isCompound ? true : null,
        round,
        usableStatus: isClarify ? "clarify" : "usable",
      }));
    }
  }
  return observations;
};

test("Provider budget derives three logical calls from paths and attempts from retry policy", async () => {
  const { calculateHybridFocusedGateBudget } =
    await loadR4AGreenModule<FocusedGateModule>(
      R4A_GREEN_MODULES.focusedGate,
      "hybrid_provider_budget",
    );
  const budget = calculateHybridFocusedGateBudget(passingMatrix());

  assert.equal(budget.authorizedLogicalCallBudget, 3);
  assert.equal(budget.maxAttemptsPerLogicalCall, 4);
  assert.equal(budget.authorizedProviderAttemptBudget, 12);
  assert.equal(budget.actualLogicalCalls, 3);
  assert.equal(budget.actualProviderAttempts, 6);
  assert.equal(budget.unusedAttempts, 6);
});

test("aggregation keeps expected clarify and Residual schema denominators separate", async () => {
  const { aggregateHybridFocusedGate } =
    await loadR4AGreenModule<FocusedGateModule>(
      R4A_GREEN_MODULES.focusedGate,
      "hybrid_gate_aggregation",
    );
  const summary = aggregateHybridFocusedGate(passingMatrix());

  assert.equal(summary.observations, 12);
  assert.equal(summary.expectedObservations, 12);
  assert.equal(summary.semanticMatches, 12);
  assert.equal(summary.usablePlans, 9);
  assert.equal(summary.expectedClarifies, 3);
  assert.equal(summary.acceptableFinalResults, 12);
  assert.equal(summary.residualProviderObservations, 3);
  assert.equal(summary.strictResidualSchemaValid, 3);
  assert.equal(summary.providerFailures, 0);
  assert.equal(summary.timeouts, 0);
  assert.equal(summary.queryCommentaryLogicalCalls, 0);
  assert.equal(summary.fullOrchestratorLogicalCalls, 0);
  assert.equal(summary.answerLogicalCalls, 0);
  assert.equal(summary.specialistLogicalCalls, 0);
  assert.equal(summary.replanLogicalCalls, 0);
  assert.equal(summary.latencyP50Ms, 60);
  assert.equal(summary.latencyUpperTailMs, 120);
  assert.equal(summary.passed, true);
  assert.deepEqual(summary.failedGates, []);
});

test("unused Provider budget never masks one failed observation", async () => {
  const { aggregateHybridFocusedGate } =
    await loadR4AGreenModule<FocusedGateModule>(
      R4A_GREEN_MODULES.focusedGate,
      "hybrid_gate_failure_aggregation",
    );
  const observations = passingMatrix();
  observations[11] = baseObservation({
    ...observations[11],
    failureCode: "residual_provider_failure",
    finalTaskIntents: [],
    mapperReached: false,
    providerFailure: true,
    residualPlannerProviderAttempts: 1,
    residualSchemaValid: false,
    semanticMatch: false,
    usableStatus: "unavailable",
  });

  const summary = aggregateHybridFocusedGate(observations);
  assert.equal(summary.providerAttempts < 12, true);
  assert.equal(summary.providerFailures, 1);
  assert.equal(summary.passed, false);
  assert.equal(summary.failedGates.includes("provider_failures"), true);
});
