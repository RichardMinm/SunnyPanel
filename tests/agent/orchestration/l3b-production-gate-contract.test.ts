import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  L3B_EVALUATION_FIXTURES,
  L3B_KNOWN_ID_DIAGNOSTICS,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  assertProductionStageFixtureIds,
  getL3BProductionStageCases,
  L3BProductionGateContractError,
  L3B_PRODUCTION_EXPECTED_BRANCHES,
  L3B_PRODUCTION_FOCUSED_FIXTURE_IDS,
  L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
  L3B_PRODUCTION_STAGE_CONTRACTS,
} from "../../../src/lib/agent/orchestration/l3b-production-gate-contract";
import { calculateProductionStageAuthorizedBudget } from "../../../src/lib/agent/orchestration/l3b-production-gate-budget";

const hash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("freezes the production gate protocol, exact stage sizes, and Focused order", () => {
  assert.equal(
    L3B_PRODUCTION_GATE_PROTOCOL_VERSION,
    "l3b-production-seam-stability-gate-v1",
  );
  assert.deepEqual(L3B_PRODUCTION_FOCUSED_FIXTURE_IDS, [
    "qry-1",
    "qry-4",
    "cmp-4",
    "wrt-1",
    "cmp-1",
  ]);
  assert.deepEqual(
    Object.fromEntries(Object.entries(L3B_PRODUCTION_STAGE_CONTRACTS).map(
      ([stage, contract]) => [
        stage,
        contract.fixtureIds.length * contract.rounds.length,
      ],
    )),
    { acceptance: 33, focused: 15, known_id: 6, stability: 99 },
  );
  assert.deepEqual(L3B_PRODUCTION_EXPECTED_BRANCHES, {
    "qry-1": "pure_query",
    "qry-4": "deterministic_clarify",
    "cmp-4": "hybrid_compound",
    "wrt-1": "full_orchestrator",
    "cmp-1": "full_orchestrator",
  });
});

test("derives Provider authorization from the one reachable production branch per fixture", () => {
  const retryLimits = {
    answerAttemptsPerObservation: 1,
    fullSchemaRetries: 0,
    fullTransportRetries: 1,
    residualSchemaRetries: 1,
    residualTransportRetries: 1,
  } as const;
  const authenticatedActor = {
    collection: "users",
    id: 1,
    isAdmin: true,
  } as const;

  assert.deepEqual(
    calculateProductionStageAuthorizedBudget({
      authenticatedActor,
      retryLimits,
      stage: "focused",
    }),
    { logicalCalls: 9, providerAttempts: 24 },
  );
  assert.deepEqual(
    calculateProductionStageAuthorizedBudget({
      authenticatedActor,
      retryLimits,
      stage: "acceptance",
    }),
    { logicalCalls: 34, providerAttempts: 65 },
  );
});

test("derives every stage case from the canonical fixture objects by identity", () => {
  const acceptance = getL3BProductionStageCases("acceptance");
  const stability = getL3BProductionStageCases("stability");
  const knownId = getL3BProductionStageCases("known_id");

  assert.deepEqual(
    acceptance.map(({ fixtureId }) => fixtureId),
    L3B_EVALUATION_FIXTURES.map(({ id }) => id),
  );
  acceptance.forEach((entry, index) => {
    assert.equal(entry.source, L3B_EVALUATION_FIXTURES[index]);
  });
  knownId.forEach((entry, index) => {
    assert.equal(entry.source, L3B_KNOWN_ID_DIAGNOSTICS[index]);
  });
  assert.equal(
    hash(acceptance.map(({ source }) => source)),
    hash(L3B_EVALUATION_FIXTURES),
  );
  assert.equal(
    hash(knownId.map(({ source }) => source)),
    hash(L3B_KNOWN_ID_DIAGNOSTICS),
  );
  for (const entry of stability) {
    assert.equal(
      entry.source,
      L3B_EVALUATION_FIXTURES.find(({ id }) => id === entry.fixtureId),
    );
  }
  assert.equal(new Set(L3B_EVALUATION_FIXTURES.map(({ id }) => id)).size, 33);
  assert.equal(new Set(L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id)).size, 6);
});

test("uses deterministic round-major stage order", () => {
  assert.deepEqual(
    getL3BProductionStageCases("focused").map(
      ({ fixtureId, round }) => `${round}:${fixtureId}`,
    ),
    [1, 2, 3].flatMap((round) =>
      L3B_PRODUCTION_FOCUSED_FIXTURE_IDS.map((id) => `${round}:${id}`)
    ),
  );
});

test("fails typed for missing, duplicate, extra, and reordered fixture IDs", () => {
  const expected = [...L3B_PRODUCTION_STAGE_CONTRACTS.focused.fixtureIds];
  const cases = [
    ["fixture_missing", expected.slice(1)],
    ["fixture_duplicate", [...expected, expected[0]]],
    ["fixture_extra", [...expected, "extra-fixture"]],
    ["fixture_reordered", [expected[1], expected[0], ...expected.slice(2)]],
  ] as const;

  for (const [code, ids] of cases) {
    assert.throws(
      () => assertProductionStageFixtureIds("focused", ids),
      (error: unknown) =>
        error instanceof L3BProductionGateContractError
        && error.code === code
        && error.message === code,
    );
  }
});
