import assert from "node:assert/strict";
import { test } from "node:test";

import {
  baseObservation,
  type FocusedGateRunnerModule,
  type FocusedObservation,
} from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

test("focused runner fixes four fixtures across three deterministic rounds", async () => {
  const { runHybridFocusedGate } =
    await loadR4AGreenModule<FocusedGateRunnerModule>(
      R4A_GREEN_MODULES.focusedGateRunner,
      "hybrid_focused_gate_runner",
    );
  const calls: Array<{
    commentaryStatus: string;
    fixtureId: string;
    index: number;
    round: number;
  }> = [];
  let residualCalls = 0;

  const observations = await runHybridFocusedGate({
    evaluate: async (input): Promise<FocusedObservation> => {
      const commentary = await input.queryCommentaryAdapter();
      calls.push({
        commentaryStatus: commentary.status,
        fixtureId: input.fixtureId,
        index: input.observationIndex,
        round: input.round,
      });
      if (input.fixtureId === "cmp-4") residualCalls += 1;
      return baseObservation({
        fixtureId: input.fixtureId,
        observationIndex: input.observationIndex,
        residualPlannerLogicalCalls: input.fixtureId === "cmp-4" ? 1 : 0,
        residualPlannerProviderAttempts:
          input.fixtureId === "cmp-4" ? 2 : 0,
        round: input.round,
      });
    },
  });

  assert.equal(observations.length, 12);
  assert.equal(residualCalls, 3);
  assert.deepEqual(calls.map(({ fixtureId }) => fixtureId), [
    "qry-1", "qry-4", "inj-2", "cmp-4",
    "qry-1", "qry-4", "inj-2", "cmp-4",
    "qry-1", "qry-4", "inj-2", "cmp-4",
  ]);
  assert.deepEqual(calls.map(({ round }) => round), [
    1, 1, 1, 1,
    2, 2, 2, 2,
    3, 3, 3, 3,
  ]);
  assert.deepEqual(calls.map(({ index }) => index), [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  ]);
  assert.deepEqual(
    new Set(calls.map(({ commentaryStatus }) => commentaryStatus)),
    new Set(["omitted"]),
  );
});

test("transport attempts never become observations or a Targeted-15 denominator", async () => {
  const { runHybridFocusedGate } =
    await loadR4AGreenModule<FocusedGateRunnerModule>(
      R4A_GREEN_MODULES.focusedGateRunner,
      "hybrid_transport_attempt_denominator",
    );
  const observations = await runHybridFocusedGate({
    evaluate: async (input) => baseObservation({
      fixtureId: input.fixtureId,
      observationIndex: input.observationIndex,
      residualPlannerLogicalCalls: input.fixtureId === "cmp-4" ? 1 : 0,
      residualPlannerProviderAttempts:
        input.fixtureId === "cmp-4" ? 4 : 0,
      round: input.round,
    }),
  });

  assert.equal(observations.length, 12);
  assert.equal(
    observations.reduce(
      (total, observation) =>
        total + observation.residualPlannerProviderAttempts,
      0,
    ),
    12,
  );
});

test("focused runner documents that Commentary omission is evaluation-only", async () => {
  const { HYBRID_QUERY_COMMENTARY_OMISSION_NOTE } =
    await loadR4AGreenModule<FocusedGateRunnerModule>(
      R4A_GREEN_MODULES.focusedGateRunner,
      "hybrid_query_commentary_omission",
    );
  assert.equal(
    HYBRID_QUERY_COMMENTARY_OMISSION_NOTE,
    "Query Commentary omitted to isolate Hybrid Query Boundary and Residual Planner evaluation.",
  );
});
