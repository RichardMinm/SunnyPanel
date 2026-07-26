import assert from "node:assert/strict";
import { test } from "node:test";

import {
  baseObservation,
  type FocusedGatePreflight,
  type FocusedGatePreflightModule,
  type FocusedGateRunnerModule,
} from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadPreflight = async (): Promise<FocusedGatePreflight> => {
  const { buildHybridFocusedGatePreflight } =
    await loadR4AGreenModule<FocusedGatePreflightModule>(
      R4A_GREEN_MODULES.focusedGatePreflight,
      "hybrid_focused_gate_preflight_runner",
    );
  return buildHybridFocusedGatePreflight({
    head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
  });
};

test("the retired Hybrid runner invokes zero evaluation callbacks", async () => {
  const { runHybridFocusedGate } =
    await loadR4AGreenModule<FocusedGateRunnerModule>(
      R4A_GREEN_MODULES.focusedGateRunner,
      "hybrid_focused_gate_retired",
    );
  let callbacks = 0;

  await assert.rejects(
    runHybridFocusedGate({
      evaluate: async () => {
        callbacks += 1;
        return baseObservation();
      },
      preflight: await loadPreflight(),
    }),
    (error: unknown) =>
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "HYBRID_FOCUSED_GATE_RETIRED",
  );
  assert.equal(callbacks, 0);
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
