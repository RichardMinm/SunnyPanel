import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  buildActorAuthorizedResourceSnapshot,
  resolveHybridQueryBoundary,
} from "../../../src/lib/agent/orchestration/query-boundary-resolver";
import {
  buildResidualPlannerSystemPrompt,
  hashResidualPlannerSchema,
} from "../../../src/lib/agent/orchestration/residual-langchain-planner";
import {
  L3B_EVALUATION_CONFIG_HASH,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-config";
import {
  L3B_EVALUATION_FIXTURES,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import type {
  FocusedGatePreflight,
  FocusedGatePreflightErrorCode,
  FocusedGatePreflightModule,
} from "./fixtures/hybrid-focused-gate-contract";
import {
  loadR4AGreenModule,
  R4A_GREEN_MODULES,
} from "./fixtures/r4a-red-module-loader";

const loadPreflight = () =>
  loadR4AGreenModule<FocusedGatePreflightModule>(
    R4A_GREEN_MODULES.focusedGatePreflight,
    "hybrid_focused_gate_preflight",
  );

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

test("Preflight fingerprints the full focused fixture context", async () => {
  const {
    buildHybridFocusedGatePreflight,
    hashHybridFocusedFixtureSnapshot,
  } = await loadPreflight();
  const preflight = buildHybridFocusedGatePreflight({
    head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
  });
  const driftedFixtures = L3B_EVALUATION_FIXTURES.map((fixture) =>
    fixture.id === "qry-1"
      ? {
          ...fixture,
          context: {
            ...fixture.context,
            now: "2026-07-17T23:59:59.000+08:00",
          },
        }
      : fixture
  );

  assert.match(preflight.fixtureSnapshotHash, /^[a-f0-9]{64}$/);
  assert.equal(
    hashHybridFocusedFixtureSnapshot(),
    preflight.fixtureSnapshotHash,
  );
  assert.notEqual(
    hashHybridFocusedFixtureSnapshot(driftedFixtures),
    preflight.fixtureSnapshotHash,
  );
});

test("Preflight hashes the real cmp-4 Residual Prompt and strict schema", async () => {
  const {
    buildHybridFocusedGatePreflight,
    HYBRID_FOCUSED_GATE_FROZEN_HASHES,
  } = await loadPreflight();
  const preflight = buildHybridFocusedGatePreflight({
    head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
  });
  const fixture = L3B_EVALUATION_FIXTURES.find(
    (candidate) => candidate.id === "cmp-4",
  );
  assert.ok(fixture);
  const snapshot = buildActorAuthorizedResourceSnapshot({
    authenticatedActor: { collection: "users", id: 7 },
    context: fixture.context,
  });
  assert.equal(snapshot.valid, true);
  if (!snapshot.valid) return;
  const boundary = resolveHybridQueryBoundary({
    authorizedSnapshot: snapshot.snapshot,
    originalRequest: fixture.message,
  });
  assert.equal(boundary.kind, "compound");
  if (boundary.kind !== "compound") return;

  assert.equal(
    preflight.residualPromptHash,
    sha256(buildResidualPlannerSystemPrompt(boundary.residualInput)),
  );
  assert.equal(
    preflight.residualSchemaHash,
    hashResidualPlannerSchema(boundary.residualInput),
  );
  assert.equal(preflight.evaluationConfigHash, L3B_EVALUATION_CONFIG_HASH);
  assert.deepEqual(HYBRID_FOCUSED_GATE_FROZEN_HASHES, {
    evaluationConfigHash:
      "f33cbc43a0e9362a31b8d0d11fb66b2e932bdc49d5ff9bf5f2fedec6b5f2acb9",
    fixtureSnapshotHash:
      "be856ddcba4a60f65e6a1e360027c3e1e5eface66c434f40f9df298b5286966d",
    residualPromptHash:
      "93f8b25dbdf2a311142b5a2830b5235cdf93179a06ea9717435102540fb8b866",
    residualSchemaHash:
      "44d6ee2304cfb3b4eeaa178253a69b6dfde98c1055d3684bdc8a42f6fc98665c",
  });
});

test("Preflight schema hashing rejects an unreviewed residual intent policy", () => {
  const fixture = L3B_EVALUATION_FIXTURES.find(
    (candidate) => candidate.id === "cmp-4",
  );
  assert.ok(fixture);
  const snapshot = buildActorAuthorizedResourceSnapshot({
    authenticatedActor: { collection: "users", id: 7 },
    context: fixture.context,
  });
  assert.equal(snapshot.valid, true);
  if (!snapshot.valid) return;
  const boundary = resolveHybridQueryBoundary({
    authorizedSnapshot: snapshot.snapshot,
    originalRequest: fixture.message,
  });
  assert.equal(boundary.kind, "compound");
  if (boundary.kind !== "compound") return;

  assert.throws(() =>
    hashResidualPlannerSchema({
      ...boundary.residualInput,
      intentPolicy: {
        allowedIntents: ["compose_checklist", "save_memory"],
        kind: "query_result_to_checklist_draft",
      },
    } as unknown as typeof boundary.residualInput)
  );
});

test("Preflight exposes only the reviewed sanitized contract", async () => {
  const { buildHybridFocusedGatePreflight } = await loadPreflight();
  const preflight = buildHybridFocusedGatePreflight({
    head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
  });

  assert.deepEqual(Object.keys(preflight).sort(), [
    "authorizedLogicalCallBudget",
    "authorizedProviderAttemptBudget",
    "baseURLHost",
    "commentaryMode",
    "evaluationConfigHash",
    "fixtureSnapshotHash",
    "head",
    "maxAttemptsPerLogicalCall",
    "model",
    "observations",
    "outputBudget",
    "residualPromptHash",
    "residualSchemaHash",
    "schemaRetries",
    "temperature",
    "timeoutMs",
    "transportRetries",
  ]);
  assert.equal(preflight.observations, 12);
  assert.equal(preflight.authorizedLogicalCallBudget, 3);
  assert.equal(preflight.schemaRetries, 1);
  assert.equal(preflight.transportRetries, 1);
  assert.equal(preflight.maxAttemptsPerLogicalCall, 4);
  assert.equal(preflight.authorizedProviderAttemptBudget, 12);
  assert.equal(preflight.commentaryMode, "omitted");
  assert.equal(preflight.baseURLHost, "api.deepseek.com");
  assert.doesNotMatch(
    JSON.stringify(preflight).toLowerCase(),
    /api[_-]?key|authorization|cookie|workspacecontext|rawrequest|rawresponse/,
  );
});

test("every frozen Preflight mismatch has a typed safe failure", async () => {
  const {
    assertHybridFocusedGatePreflight,
    buildHybridFocusedGatePreflight,
  } = await loadPreflight();
  const preflight = buildHybridFocusedGatePreflight({
    head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
  });
  const mismatches: readonly [
    keyof FocusedGatePreflight,
    unknown,
    FocusedGatePreflightErrorCode,
  ][] = [
    [
      "fixtureSnapshotHash",
      "0".repeat(64),
      "FIXTURE_SNAPSHOT_HASH_MISMATCH",
    ],
    [
      "residualPromptHash",
      "0".repeat(64),
      "RESIDUAL_PROMPT_HASH_MISMATCH",
    ],
    [
      "residualSchemaHash",
      "0".repeat(64),
      "RESIDUAL_SCHEMA_HASH_MISMATCH",
    ],
    [
      "evaluationConfigHash",
      "0".repeat(64),
      "EVALUATION_CONFIG_HASH_MISMATCH",
    ],
    ["observations", 11, "OBSERVATION_CONTRACT_MISMATCH"],
    ["commentaryMode", "enabled", "QUERY_COMMENTARY_MODE_MISMATCH"],
    [
      "authorizedProviderAttemptBudget",
      13,
      "RESIDUAL_BUDGET_CONFIG_MISMATCH",
    ],
  ];

  assert.doesNotThrow(() =>
    assertHybridFocusedGatePreflight(preflight)
  );
  for (const [field, value, code] of mismatches) {
    assert.throws(
      () =>
        assertHybridFocusedGatePreflight({
          ...preflight,
          [field]: value,
        } as FocusedGatePreflight),
      (error: unknown) =>
        typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === code
        && !("cause" in error),
      `${field} should fail with ${code}`,
    );
  }
});

test("invalid focused fixture sources fail with typed safe codes", async () => {
  const { buildHybridFocusedGatePreflight } = await loadPreflight();
  assert.throws(
    () =>
      buildHybridFocusedGatePreflight({
        fixtures: L3B_EVALUATION_FIXTURES.filter(
          (fixture) => fixture.id !== "cmp-4",
        ),
        head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
      }),
    (error: unknown) =>
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "FOCUSED_FIXTURE_SET_INVALID",
  );

  const cmp4NoLongerCompound = L3B_EVALUATION_FIXTURES.map((fixture) =>
    fixture.id === "cmp-4"
      ? { ...fixture, message: "检查项目进度" }
      : fixture
  );
  assert.throws(
    () =>
      buildHybridFocusedGatePreflight({
        fixtures: cmp4NoLongerCompound,
        head: "5f374b07318d3080d9adacdef1618f08f82f0cf0",
      }),
    (error: unknown) =>
      typeof error === "object"
      && error !== null
      && "code" in error
      && error.code === "CMP4_RESIDUAL_INPUT_INVALID",
  );
});
