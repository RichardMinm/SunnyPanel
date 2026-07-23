import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

import {
  L3B_EVALUATION_FIXTURES,
  L3B_KNOWN_ID_DIAGNOSTICS,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-fixtures";
import {
  L3B_EVALUATION_CONFIG_HASH,
} from "../../../src/lib/agent/orchestration/l3b-evaluation-config";
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

type ProductionGatePreflight = Readonly<{
  budget: Readonly<{
    actualProviderAttempts: number;
    authorizedLogicalCallMaximum: number;
    authorizedMaximum: number;
    businessObservations: number;
  }>;
  evaluationConfigHash: string;
  fixtureIds: readonly string[];
  observationCount: number;
  providerAttempts: number;
  reportPath: string;
  rounds: readonly number[];
  stage: string;
  status: string;
}>;

type ProductionGateProcessMessage = Readonly<{
  failureCode?: string;
  preflight?: ProductionGatePreflight | null;
  providerAttempts?: number;
}>;

const jsonLines = (value: string): ProductionGateProcessMessage[] =>
  value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line) as ProductionGateProcessMessage);

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
  assert.equal(L3B_KNOWN_ID_DIAGNOSTICS.length, 6);
  const conflict = L3B_KNOWN_ID_DIAGNOSTICS.at(-1);
  assert.equal(conflict?.id, "diag-plan-title-conflicting-id");
  assert.equal(conflict?.message, "把英语复习计划 101 安排到下周");
  assert.deepEqual(
    conflict?.context.plans.map(({ id }) => id),
    [101, 102],
  );

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

test("settles Provider attempts in finally and retains the Known-ID outcome", () => {
  const source = readFileSync(
    "scripts/agent-production-seam-gate-eval.mjs",
    "utf8",
  );
  const evaluation = source.indexOf("await evaluateProductionGateCase({");
  const settlement = source.indexOf(
    "providerAttemptCount(projectModelCallBudget(recorder.snapshot()))",
    evaluation,
  );
  const finallyBlock = source.lastIndexOf("finally", settlement);

  assert.notEqual(evaluation, -1);
  assert.ok(finallyBlock > evaluation);
  assert.ok(settlement > finallyBlock);
  assert.doesNotMatch(
    source,
    /providerAttemptCount\(recorder\.snapshot\(\)\)/u,
  );
  assert.match(
    source,
    /knownIdOutcome:\s*observation\.knownIdOutcome/u,
  );
  assert.match(
    source,
    /knownIdRejectionSource:\s*observation\.knownIdRejectionSource/u,
  );
  assert.match(
    source,
    /createModelCallBudgetRecorder,\s*projectModelCallBudget/u,
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

test("the production-seam CLI reaches the canonical Known-ID preflight without a Provider key", () => {
  const reportPath = "/tmp/l3b-r8-production-known-id-v3.json";
  const reportExistedBefore = existsSync(reportPath);
  const reportBefore = reportExistedBefore
    ? statSync(reportPath)
    : null;
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim().length > 0;

  const child = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/agent-production-seam-gate-eval.mjs",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        AGENT_LIVE_LLM_EVAL: "1",
        AGENT_PRODUCTION_SEAM_EVAL: "1",
        HOME: process.env.HOME ?? "",
        L3B_PRODUCTION_GATE_ACCEPTED_CONFIG_HASH:
          L3B_EVALUATION_CONFIG_HASH,
        L3B_PRODUCTION_GATE_ACCEPTED_HEAD: head,
        L3B_PRODUCTION_GATE_PREFLIGHT_ONLY: "1",
        L3B_PRODUCTION_GATE_STAGE: "known_id",
        L3B_PRODUCTION_PROVIDER_DATA_APPROVED: "1",
        NODE_ENV: "test",
        PATH: process.env.PATH ?? "",
        PAYLOAD_SECRET: "sunnypanel-agent-test-secret-2026",
        TMPDIR: process.env.TMPDIR ?? "/tmp",
      },
    },
  );

  const messages = [
    ...jsonLines(child.stdout),
    ...jsonLines(child.stderr),
  ];
  const terminal = messages.find(
    ({ preflight }) => preflight !== undefined,
  );
  assert.ok(terminal?.preflight);
  const preflight = terminal.preflight;

  assert.equal(preflight.stage, "known_id");
  assert.equal(preflight.observationCount, 6);
  assert.deepEqual(
    preflight.fixtureIds,
    L3B_KNOWN_ID_DIAGNOSTICS.map(({ id }) => id),
  );
  assert.deepEqual(preflight.rounds, [1]);
  assert.equal(preflight.reportPath, reportPath);
  assert.equal(preflight.evaluationConfigHash, L3B_EVALUATION_CONFIG_HASH);
  assert.equal(preflight.providerAttempts, 0);
  assert.equal(preflight.budget.businessObservations, 6);
  assert.equal(preflight.budget.authorizedLogicalCallMaximum, 6);
  assert.equal(preflight.budget.authorizedMaximum, 24);
  assert.equal(preflight.budget.actualProviderAttempts, 0);

  if (dirty) {
    assert.equal(child.status, 1);
    assert.equal(terminal.failureCode, "WORKTREE_NOT_CLEAN");
    assert.equal(preflight.status, "blocked");
  } else if (reportExistedBefore) {
    assert.equal(child.status, 1);
    assert.equal(terminal.failureCode, "REPORT_PATH_EXISTS");
    assert.equal(preflight.status, "blocked");
  } else {
    assert.equal(child.status, 0);
    assert.equal(terminal.failureCode, undefined);
    assert.equal(preflight.status, "ready");
  }

  assert.equal(existsSync(reportPath), reportExistedBefore);
  if (reportBefore) {
    const reportAfter = statSync(reportPath);
    assert.equal(reportAfter.mtimeMs, reportBefore.mtimeMs);
    assert.equal(reportAfter.size, reportBefore.size);
  }
});
